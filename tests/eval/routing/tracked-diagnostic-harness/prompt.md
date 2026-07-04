Our HTTP client intermittently drops responses under load and I can't reproduce
it from reading the code. I think the way to get to the bottom of it is to add a
request/response logging interceptor, and probably pull in a small mock-server
test dependency so we can drive it under controlled concurrency.

Go ahead and use that approach — figure out what's actually going wrong.
