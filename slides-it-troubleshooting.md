---
theme: seriph
title: ARM users run IT locally failure issue
author: Howie Zhao
date: 2024.03.22
transition: slide-left
selectable: true
colorSchema: dark
defaults:
  class: larger-body
---

# ARM users run IT locally failure issue

<div class="abs-br m-6 text-xl">
  {{ $frontmatter.date }}
  <a href="https://github.com/howiezhao/slides" target="_blank">
    <carbon:logo-github />
  </a>
</div>

---
layout: section
---

# Issue

---
layout: fact
---

Previously, if someone was using a MacBook with the latest M-chip (ARM architecture), they might encounter an error when running IT locally via Postman: `socket hang up`.

---
layout: fact
---

Error log:

![image](/images/issue-log.png)

---
layout: section
---

# Troubleshooting

---
layout: fact
---

First Thing: **Search**

- Search on Slack
- Search on Google
- Search on GitHub Issues (sometimes)

<style>
ul {
  width: fit-content;
  margin-inline: auto;
  text-align: left;
}
</style>

---
layout: fact
---

Luckily, some clues were found on Slack.

Furthermore, this may be a LuaJIT bug: https://github.com/LuaJIT/LuaJIT/issues/671

Issue #671 has been closed and the bug has been fixed on [March 11, 2021](https://github.com/LuaJIT/LuaJIT/commit/67dbec82f4f05a416a78a560a726553beaa7a223).

---
layout: fact
---

What is OpenResty?

OpenResty = Forked LuaJIT + Customized Nginx

Forked LuaJIT == [LuaJIT 2](https://github.com/openresty/luajit2)

---
layout: fact
---

Q: Upstream LuaJIT has fixed this bug, so are there any synchronized changes in LuaJIT 2?

A: Yes, [commit](https://github.com/openresty/luajit2/commit/67dbec82f4f05a416a78a560a726553beaa7a223), and this fix has been released in `v2.1-20211210` and later versions.

LuaJIT 2 `v2.1-20211210` was released on [November 17, 2021](https://github.com/openresty/luajit2/releases/tag/v2.1-20211210), so it is possible for OpenResty after this date to integrate this fix.

---
layout: fact
---

On this [page](https://openresty.org/en/download.html), we can find that the OpenResty [1.21.4.1](https://openresty.org/en/changelog-1021004.html#version-12141---18-may-2022) version released on May 18, 2022 began to integrate this fix.

This means:

As long as we use OpenResty after version 1.21.4.1, we will not have this issue!

---
layout: fact
---

At the time, the OpenResty version we were using was 1.17.8.2, so we had this issue.

The issue becomes simple, just upgrade the OpenResty version.

😀

---
layout: fact
---

But...

After we upgraded the OpenResty version, the issue still existed

---
layout: fact
---

Maybe this issue is not caused by issue #671?

Any other reasons?

Looks like this issue related to memory allocation.

Maybe it's caused by a third-party Lua package?

---
layout: fact
---

We have made some simple attempts, such as upgrading some suspicious Lua packages to the latest version and building images to test whether the issue still exists.

The result is useless.

---
layout: fact
---

Why still have issues after upgrading OpenResty?

Let’s revisit issue [#671](https://github.com/LuaJIT/LuaJIT/issues/671)

---
layout: center
class: text-center
---

What did Mike do?

Line [368](https://github.com/LuaJIT/LuaJIT/blob/d06beb0480c5d1eb53b3343e78063950275aa281/src/lj_alloc.c#L368-L372) of `lj_alloc.c`:

```diff
-#if LJ_64 && !LJ_GC64
+#if LJ_64 && (!LJ_GC64 || LJ_TARGET_ARM64)
 #define CALL_MREMAP_MV         CALL_MREMAP_NOMOVE
 #else
 #define CALL_MREMAP_MV         CALL_MREMAP_MAYMOVE
 #endif
```

<style>
pre {
  text-align: left;
}
</style>

---
layout: fact
---

What is `LJ_TARGET_ARM64`?

`LJ_TARGET_ARM64` is a macro.

Where is this macro defined?

Line [265](https://github.com/LuaJIT/LuaJIT/blob/d06beb0480c5d1eb53b3343e78063950275aa281/src/lj_arch.h#L265) of `lj_arch.h`

---
layout: center
---

```c
#elif LUAJIT_TARGET == LUAJIT_ARCH_ARM64

#define LJ_ARCH_BITS		64
#if defined(__AARCH64EB__)
#define LJ_ARCH_NAME		"arm64be"
#define LJ_ARCH_ENDIAN		LUAJIT_BE
#else
#define LJ_ARCH_NAME		"arm64"
#define LJ_ARCH_ENDIAN		LUAJIT_LE
#endif
#if !defined(LJ_ABI_PAUTH) && defined(__arm64e__)
#define LJ_ABI_PAUTH		1
#endif
#define LJ_TARGET_ARM64		1
#define LJ_TARGET_EHRETREG	0
#define LJ_TARGET_EHRAREG	30
#define LJ_TARGET_JUMPRANGE	27	/* +-2^27 = +-128MB */
#define LJ_TARGET_MASKSHIFT	1
#define LJ_TARGET_MASKROT	1
#define LJ_TARGET_UNIFYROT	2	/* Want only IR_BROR. */
#define LJ_TARGET_GC64		1
#define LJ_ARCH_NUMMODE		LJ_NUMMODE_DUAL

#define LJ_ARCH_VERSION		80
```

---
layout: center
class: text-center
---

When does `LUAJIT_TARGET == LUAJIT_ARCH_ARM64`?

Line [61](https://github.com/LuaJIT/LuaJIT/blob/d06beb0480c5d1eb53b3343e78063950275aa281/src/lj_arch.h#L61) of `lj_arch.h`

```c
#elif defined(__aarch64__) || defined(_M_ARM64)
#define LUAJIT_TARGET	LUAJIT_ARCH_ARM64
```

<style>
pre {
  text-align: left;
}
</style>

---
layout: fact
---

What is `__aarch64__`? What is `_M_ARM64`?

`__aarch64__` is a [GCC predefined macro](https://gcc.gnu.org/onlinedocs/cpp/System-specific-Predefined-Macros.html)

`_M_ARM64` is a [MSVC predefined macro](https://learn.microsoft.com/en-us/cpp/preprocessor/predefined-macros?view=msvc-170#microsoft-specific-predefined-macros)

---
layout: fact
---

Only if you compile LuaJIT with GCC on an ARM64 architecture platform, you will get the `__aarch64__` predefined macro.

---
layout: fact
---

Now, we know why this issue still occurs:

Previously, we only had an OpenResty image for the X86 architecture. On the ARM architecture, we still ran this X86 image.

---
layout: section
---

# Solution

---
layout: fact
---

1. Upgrade OpenResty to the specified version
2. Build ARM image

<style>
ol {
  width: fit-content;
  margin-inline: auto;
  text-align: left;
}
</style>

---
layout: fact
---

To resolve this issue, the version of OpenResty is at least 1.21.4.1.

Considering that the version is too new and may bring many unknown changes, it is a safe choice to choose the version closest to us.

---
layout: fact
---

When building an ARM image, we also need to make some adjustments to some existing packages.

For example, cassandra-driver does not have a built arm64 package, so we need to compile and install it directly from the source code.

---
layout: section
---

# Final

---
layout: fact
---

What We Learned

- Search
- Go deeper into issues and fixes

<style>
ul {
  width: fit-content;
  margin-inline: auto;
  text-align: left;
}
</style>

---
layout: end
---

🥳 Thank you all, this sharing ends here. 🥳

<div class="abs-br m-6 text-xl">
  <PoweredBySlidev mt-10 />
</div>
