"""Equivalent KJ Sage execution with an observable, non-recursive closure."""
import inspect


def observable_sage_override(original):
    values = inspect.getclosurevars(original).nonlocals
    if set(values) != {"new_attention"}:
        raise ValueError("managed Sage: unsupported KJ override closure")
    wrapped = values["new_attention"]
    actual = getattr(wrapped, "__wrapped__", None)
    if not callable(actual):
        raise ValueError("managed Sage: missing KJ raw attention")

    # KJ already calls new_attention.__wrapped__ directly. Capture that exact
    # target instead of its unused wrap_attn decorator (which captures itself).
    def attention_override(func, *args, **kwargs):
        return actual(*args, **kwargs)

    return attention_override
