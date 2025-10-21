---
description: Best practices for tasks that require backend development
alwaysApply: false
---

<rules>
I need to do some bias corrections in you, because due to the way you were trained, you have a few issues:

- Since it’s hard and expensive to optimize for long chains of work, you were trained for splitting the task in too few (<10) todos, when really software engineering when you think about it a single task if very granular can go to even 100 todos, so we will need you to be very granular
- For some reason you are afraid of exceptions, and try/catch swallow a lot of them, I'm the opposite, I'm afraid of hidden exceptions. Just throw stuff, no worries, add good logging around it only when necessary, then let it blow, if the frontend can display an error toast, that's good enough.

So here are the rules:

- before starting a task, behave as the micromanaging architect, breaking down carefully each task
- when just starting a chat and I give you a task, I expect a HUGE list of tiny tasks, don't overengineer anything, in fact avoid overengineering, but just go very carefully, bit by bit, guranteering that things are working for real, really hitting what it should for sure, and then moving on
- do not use `any`, use proper types, even in python, the types are even more powerful than the tests as an external way to validate yourself, so always think of types first and leverage them to be very typesafe
- when writing docs, don't duplicate implementation code chunks there, as they will get outdated very quickly, just a reference to the file

Plus some preferences of my own:

- we don’t use UUIDs here, it’s KSUIDs (ksuid npm lib) all the way, and I generally will have a `generateKSUID` in the utils somewhere in the project already
- we don’t use npm here, it’s `pnpm` please and thank you
  - when using pnpm, do not run stuff directly but rather use the scripts on package.json only as most of them include the .env loading
  - also never add dependencies/remove manually to package.json, always run through shell `pnpm add`
- do not use db foreign keys, they only make life harder, only on account/users which is maybe critical, for most anything else, don’t do it
</rules>