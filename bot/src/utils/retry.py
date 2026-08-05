import asyncio
import functools
from utils.logger import get_logger

log = get_logger("retry")


def async_retry(max_retries=3, delay=1.0, backoff=2.0, exceptions=(Exception,)):
    """Decorator for async retry with exponential backoff."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            _delay = delay
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        log.error(f"{func.__name__} failed after {max_retries} retries: {e}")
                        raise
                    log.warning(f"{func.__name__} attempt {attempt+1} failed: {e}. Retrying in {_delay}s")
                    await asyncio.sleep(_delay)
                    _delay *= backoff
        return wrapper
    return decorator