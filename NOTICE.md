# NOTICE

## Attribution

PocketClaw is an **independent implementation**, inspired by the architecture and
user experience of **Happy** by the slopus contributors:

- Project: <https://github.com/slopus/happy>
- License: MIT

**No source code was copied from Happy.** The Happy repository was read for
protocol and UX inspiration only. Where a non-trivial design pattern was adapted,
the corresponding PocketClaw source file carries an inline comment:
`// Pattern inspired by slopus/happy (MIT)`.

For completeness, the text of Happy's MIT license is reproduced below:

```
MIT License

Copyright (c) Slopus contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other credits

- **Anthropic Claude Agent SDK** — PocketClaw's host daemon drives Claude Code
  sessions through the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sdk)
  (`@anthropic-ai/claude-agent-sdk`). Claude, Claude Code, and the Claude Agent SDK
  are products of Anthropic, PBC. PocketClaw is not affiliated with or endorsed by
  Anthropic.
- **Anthropic Claude Code Remote Control documentation** — referenced as prior art
  for the remote-driving model.

PocketClaw itself is released under the MIT License — see [LICENSE](./LICENSE).
