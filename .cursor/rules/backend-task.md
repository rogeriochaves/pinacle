---
description: Best practices for tasks that require backend development
globs:
alwaysApply: true
---

<rules>
I need to do some bias corrections in you, because due to the way you were trained, you have a few issues:

- You were trained to be a people pleaser and solve problems, therefore you are biased to think the problems are solved very shortly, which leads to lazyness and believing a solution is working when it’s not really, we need to fix that, putting this trust outside you
- You were trained to benchmaxx SWE-bench and other benchmarks, as a result you recur by default to quick and dirty scripts just to check if things are working instead of using testing libraries by default, let’s fix that
- Since it’s hard and expensive to optimize for long chains of work, you were trained for splitting the task in too few (<10) todos, when really software engineering when you think about it a single task if very granular can go to even 100 todos, so we will need you to be very granular

So here are the rules:

- before starting a task, behave as the micromanaging architect, breaking down carefully each task, where more or less group of tasks must be tested with REAL INTEGRATION tests, as much as possible, with the minimum amount of mocks as possible
- let me reiterate that: you should always seek _external_ proof that your task worked, if it talks to a db, then it should really be on the db, if it executes another service, then it should really do the api call, do not trust yourself without proof
- do not write unit tests unless for very specific cases where they are valuable e.g. regex testing, most of the time ignore them, do real integration tests
- always use vitest/pytest/whatever is the default testing library of the language, don’t write one-off scripts for quick cheking yourself, quick debugs are fine but we should have a real integration test file to commit
- when just starting a chat and I give you a task, I expect a HUGE list of tiny tasks, don't overengineer anything, in fact avoid overengineering, but just go very carefully, bit by bit, guranteering that things are working for real, really hitting what it should for sure, and then moving on
- do not use `any`, use proper types, even in python, the types are even more powerful than the tests as an external way to validate yourself, so always think of types first and leverage them to be very typesafe
- when writing docs, don't duplicate implementation code chunks there, as they will get outdated very quickly, just a reference to the file
- tests can be heavy and take a while, so instead of running everything all the time, focus on what you are working on using the specific test name or `.only` marker, but then DO RUN all the tests at the end to verify you didn’t break something else
- do not narrow down the test outputs with `grep -E ` or whatever, always try to see the whole output, if you want to laser focus better to do with .only
- when writing the integration tests, do the cleanup on the beforeAll, NOT on the afterAll, it's ok to leave the environment dirty (so we can debug it), but the tests should always start with a clean state

Plus some preferences of my own:

- we don’t use UUIDs here, it’s KSUIDs (ksuid npm lib) all the way, and I generally will have a `generateKSUID` in the utils somewhere in the project already
- we don’t use npm here, it’s `pnpm` please and thank you
  - when using pnpm, do not run stuff directly but rather use the scripts on package.json only as most of them include the .env loading
  - also never add dependencies/remove manually to package.json, always run through shell `pnpm add`
- do not use db foreign keys, they only make life harder, only on account/users which is maybe critical, for most anything else, don’t do it
</rules>