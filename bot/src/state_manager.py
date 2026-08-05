import asyncio
from datetime import datetime, timezone
from utils.logger import get_logger

log = get_logger("state")


class StateManager:
    """Handles loading/saving bot state to CF API for restart recovery."""

    def __init__(self, api_client):
        self.api = api_client
        self.state = {}  # account_id -> {group_id -> state_dict}
        self._dirty = set()  # account_ids with unsaved changes

    async def load_account_state(self, account_id: int):
        """Load saved state for an account."""
        try:
            result = await self.api.load_state(account_id)
            states = result.get("states", [])
            self.state[account_id] = {
                str(s["group_id"]): s for s in states
            }
            log.info(f"[{account_id}] Loaded state for {len(states)} groups")
        except Exception as e:
            log.warning(f"[{account_id}] Failed to load state: {e}")
            self.state[account_id] = {}

    def get_group_state(self, account_id: int, group_id: int):
        return self.state.get(account_id, {}).get(str(group_id), {})

    def update_meow_time(self, account_id: int, group_id: int):
        if account_id not in self.state:
            self.state[account_id] = {}
        key = str(group_id)
        if key not in self.state[account_id]:
            self.state[account_id][key] = {"account_id": account_id, "group_id": group_id}
        self.state[account_id][key]["last_meow_time"] = datetime.now(timezone.utc).isoformat()
        self._dirty.add(account_id)

    def update_fish_time(self, account_id: int, group_id: int):
        if account_id not in self.state:
            self.state[account_id] = {}
        key = str(group_id)
        if key not in self.state[account_id]:
            self.state[account_id][key] = {"account_id": account_id, "group_id": group_id}
        self.state[account_id][key]["last_fish_time"] = datetime.now(timezone.utc).isoformat()
        self._dirty.add(account_id)

    def get_catchup_groups(self, account_id: int, interval_seconds: int):
        """
        Determine which groups need immediate action after restart.
        Returns list of group_ids where last_meow_time is older than interval.
        """
        now = datetime.now(timezone.utc)
        catchup = []
        for group_id_str, state in self.state.get(account_id, {}).items():
            last_time = state.get("last_meow_time")
            if last_time:
                try:
                    last_dt = datetime.fromisoformat(last_time)
                    if (now - last_dt).total_seconds() >= interval_seconds:
                        catchup.append(int(group_id_str))
                except (ValueError, TypeError):
                    catchup.append(int(group_id_str))
            else:
                catchup.append(int(group_id_str))
        return catchup

    async def save_dirty(self):
        """Save all dirty account states to CF API."""
        if not self._dirty:
            return
        all_states = []
        for account_id in self._dirty:
            for group_state in self.state.get(account_id, {}).values():
                all_states.append({
                    "account_id": group_state["account_id"],
                    "group_id": group_state["group_id"],
                    "last_meow_time": group_state.get("last_meow_time"),
                    "last_fish_time": group_state.get("last_fish_time"),
                    "pending_timer_expiry": group_state.get("pending_timer_expiry"),
                })
        try:
            await self.api.save_state(all_states)
            self._dirty.clear()
            log.info(f"Saved state for {len(all_states)} group-states")
        except Exception as e:
            log.error(f"Failed to save state: {e}")

    async def periodic_save(self, interval: int, stop_event: asyncio.Event):
        """Background task to periodically save state."""
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
                break
            except asyncio.TimeoutError:
                pass
            await self.save_dirty()