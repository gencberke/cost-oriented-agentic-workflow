In `lib/checkout.dart` two unrelated things are wrong, and both happen to live
in that one file:

1. The tax line rounds incorrectly — it truncates instead of rounding to the
   nearest cent.
2. The "Apply coupon" button stays disabled even after a valid code is entered.

Both edits are in the same file and each looks tiny. Please fix them.
