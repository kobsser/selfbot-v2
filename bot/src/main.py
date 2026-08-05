import asyncio
import signal
import sys
import os
from datetime import datetime, timezone

from config import Config
from crypto import SessionCrypto
from api_client import CFApiClient
from state_manager import StateManager
from telegram_manager import TelegramManager
from automations import MeowAutomation, FishAutomation, SmuggleAutomation
from handlers import register_handlers
from utils.logger import get_logger, mask_phone

log = get_logger("main")

# Global shutdown event
shutdown_event = asyncio.Event()
actions_counter = {"total": 0}


def handle_signal(signum, frame):
    log.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_event.set()


async def run_account(account, config, crypto, state_mgr, tg_mgr):
    account_id = account["id"]
    phone = account["phone"]
    safe_phone = mask_phone(phone)
    groups = account["selected_groups"]

    if not groups:
        log.warning(f"[account:{account_id}] No groups selected, skipping")
        return

    await state_mgr.load_account_state(account_id)

    try:
        client = await tg_mgr.start_client(account)
    except Exception as e:
        log.error(f"[account:{account_id}] Cannot start client: {e}")
        return

    # Build automations based on settings
    automations = []
    if account.get("meow_enabled", True):
        automations.append(MeowAutomation(
            account_id, phone, groups,
            {
                "meow_interval": account.get("meow_interval", 300),
                "randomize_delay": bool(account.get("randomize_delay", 1)),
            }
        ))
    if account.get("fish_enabled", True):
        automations.append(FishAutomation(account_id, phone, groups, {}))
    if account.get("smuggle_enabled", True):
        automations.append(SmuggleAutomation(account_id, phone, groups, {}))

    # Register message handlers
    register_handlers(client, account, automations, config.bot_user_id)

    # Run all automations concurrently
    tasks = []
    for automation in automations:
        task = asyncio.create_task(
            automation.run(client),
            name=f"{automation.name}_{account_id}"
        )
        tasks.append(task)

    tg_mgr.tasks[account_id] = tasks

    try:
        # Wait until shutdown or all tasks complete
        while not shutdown_event.is_set():
            await asyncio.sleep(5)
            # Check if any task crashed
            for task in tasks:
                if task.done() and task.exception():
                    log.error(f"[{safe_phone}] Task {task.get_name()} crashed: {task.exception()}")
    finally:
        # Stop all automations
        for automation in automations:
            automation.stop()
        # Wait for tasks to finish
        await asyncio.gather(*tasks, return_exceptions=True)
        # Stop client
        await tg_mgr.stop_client(account_id)

        # Count actions
        for automation in automations:
            actions_counter["total"] += automation.actions_count

        log.info(f"[{safe_phone}] Account runner finished")


async def main():
    log.info("=" * 50)
    log.info("Selfbot v2 starting...")
    log.info("=" * 50)

    # Load config
    config = Config()
    config.validate()
    crypto = SessionCrypto(config.encryption_key)

    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    async with CFApiClient(config.cf_api_url, config.bot_api_key) as api:
        # Register this job
        run_id = os.getenv("GITHUB_RUN_ID", "local")
        job_info = await api.start_job(run_id)
        job_id = job_info.get("jobId")
        log.info(f"Job registered with ID: {job_id}")

        # Load full config
        try:
            full_config = await api.get_config()
        except Exception as e:
            log.error(f"Failed to load config: {e}")
            await api.complete_job(job_id, "failed", 0, 0)
            return

        settings = full_config.get("settings", {})
        accounts = full_config.get("accounts", [])

        if not accounts:
            log.warning("No active accounts found, exiting")
            await api.complete_job(job_id, "completed", 0, 0)
            return

        log.info(f"Loaded {len(accounts)} active accounts")

        # Calculate run duration from settings
        run_hours = int(settings.get("run_hours", "4"))
        run_minutes = int(settings.get("run_minutes", "55"))
        run_duration = (run_hours * 3600) + (run_minutes * 60)
        log.info(f"Run duration: {run_hours}h {run_minutes}m ({run_duration}s)")

        # Initialize managers
        state_mgr = StateManager(api)
        tg_mgr = TelegramManager(config.tg_api_id, config.tg_api_hash, crypto)

        # Start state periodic saver
        state_task = asyncio.create_task(
            state_mgr.periodic_save(config.state_save_interval, shutdown_event)
        )

        # Start heartbeat task
        async def heartbeat_loop():
            while not shutdown_event.is_set():
                try:
                    await asyncio.wait_for(shutdown_event.wait(), timeout=config.heartbeat_interval)
                    break
                except asyncio.TimeoutError:
                    pass
                try:
                    await api.heartbeat(job_id)
                except Exception as e:
                    log.warning(f"Heartbeat failed: {e}")

        heartbeat_task = asyncio.create_task(heartbeat_loop())

        # Schedule shutdown after run_duration - buffer
        async def shutdown_timer():
            try:
                await asyncio.wait_for(
                    shutdown_event.wait(),
                    timeout=run_duration - config.shutdown_buffer
                )
            except asyncio.TimeoutError:
                log.info("Run duration reached, initiating graceful shutdown")
                shutdown_event.set()

        timer_task = asyncio.create_task(shutdown_timer())

        # Run all accounts concurrently
        account_tasks = []
        for account in accounts:
            task = asyncio.create_task(
                run_account(account, config, crypto, state_mgr, tg_mgr),
                name=f"account_{account['id']}"
            )
            account_tasks.append(task)

        # Wait for shutdown signal
        await shutdown_event.wait()
        log.info("Shutdown signal received, stopping all accounts...")

        # Cancel account tasks
        for task in account_tasks:
            task.cancel()
        await asyncio.gather(*account_tasks, return_exceptions=True)

        # Cancel background tasks
        timer_task.cancel()
        heartbeat_task.cancel()
        state_task.cancel()

        # Final state save
        await state_mgr.save_dirty()

        # Stop any remaining clients
        await tg_mgr.stop_all()

        # Report completion
        status = "completed"
        try:
            await api.complete_job(job_id, status, len(accounts), actions_counter["total"])
            log.info(f"Job completed. Accounts: {len(accounts)}, Actions: {actions_counter['total']}")
        except Exception as e:
            log.error(f"Failed to report completion: {e}")

    log.info("Selfbot v2 shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())