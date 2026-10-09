import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("managed_attention", Path(__file__).parents[2] / "comfy_nodes/LocalVideoStudio-H3/managed_attention.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ManagedAttentionTests(unittest.TestCase):
    def test_delegates_to_the_same_raw_function_and_preserves_arguments(self):
        calls = []
        def raw(*args, **kwargs):
            calls.append((args, kwargs))
            return args, kwargs
        def decorate(actual):
            def wrapper(*args, **kwargs):
                # Core wrap_attn has a self reference; KJ bypasses this wrapper.
                _ = wrapper
                raise AssertionError("unused decorator must never execute")
            wrapper.__wrapped__ = actual
            return wrapper
        new_attention = decorate(raw)
        def original(func, *args, **kwargs):
            return new_attention.__wrapped__(*args, **kwargs)
        adapted = module.observable_sage_override(original)
        args = (object(), object(), object(), 8)
        kwargs = {"mask": object(), "low_precision_attention": False, "skip_reshape": True}
        self.assertEqual(adapted(None, *args, **kwargs), original(None, *args, **kwargs))
        self.assertEqual(len(calls), 2)
        self.assertIs(adapted.__closure__[0].cell_contents, raw)
        self.assertIs(new_attention.__wrapped__, raw)

    def test_unknown_wrapper_is_not_silently_unwrapped(self):
        with self.assertRaisesRegex(ValueError, "unsupported KJ"):
            module.observable_sage_override(lambda *args: args)
        new_attention = lambda *args: args
        def missing(func, *args, **kwargs):
            return new_attention(*args, **kwargs)
        with self.assertRaisesRegex(ValueError, "missing KJ"):
            module.observable_sage_override(missing)


if __name__ == "__main__":
    unittest.main()
