import logging
import sys


def mask_phone(phone: str) -> str:
    """Mask phone number, showing only last 3 digits."""
    if not phone or len(phone) < 4:
        return "***"
    return f"***{phone[-3:]}"


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            "[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger