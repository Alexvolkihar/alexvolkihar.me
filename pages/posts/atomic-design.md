---
title: "Mastering Atomic Design: From Copy-Paste to Design System"
date: 2026-07-28T00:00:00Z
lang: en
duration: 18min
description: A comprehensive, progressive guide to understanding, implementing, and mastering Atomic Design, illustrated side by side with Symfony UX Twig Components and Vue 3.
---

> [Version Française](/posts/atomic-design-fr)

> Slides: [SPA](https://slides.alexvolkihar.ovh/2026/atomic-design/) (French only)
>
> Made with <Slidev class="inline"/> [**Slidev**](https://github.com/slidevjs/slidev) - presentation slides for developers.

[[toc]]

The user interface is often the most mistreated layer of an application. We ship fast, under pressure, duplicating a block of markup "just for this page", adding a utility class "just for this case". Six months later, the design team asks to change the border radius of buttons. That is when we discover there are fourteen different implementations of the primary button, spread across twenty-three files, with seven slightly distinct shades of blue.

This is the symptom of an interface **without architecture**. Exactly the same problem as business code coupled to its framework, transposed to the presentation layer.

This is where **Atomic Design** comes in. Formalized by Brad Frost in 2013 and developed in his eponymous book in 2016, this model proposes thinking of an interface not as a collection of pages, but as a **system of components** that are hierarchical, reusable, and testable in isolation.

What follows starts from that kind of page, walks through the five levels of the model, and then builds the same system twice: once with **Symfony UX Twig Components** on the server, once with **Vue 3** on the client. Doing it twice is the point. It shows the model owes nothing to either framework.

---

## 1. The starting point: the copy-paste interface

Here is a product listing written as a single block. Nothing unusual about it:

```twig
{# templates/catalog/list.html.twig #}
<section class="py-8 px-6">
    <h2 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 24px;">
        Our products
    </h2>

    <div class="grid grid-cols-3 gap-6">
        {% for product in products %}
            <article class="border border-gray-200 rounded-lg p-4 shadow-sm">
                <img src="{{ product.imageUrl }}" alt="{{ product.name }}" class="w-full h-48 object-cover rounded">

                <h3 style="font-size: 18px; font-weight: 600; margin-top: 12px;">
                    {{ product.name }}
                </h3>

                <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">
                    {{ product.description|slice(0, 80) }}…
                </p>

                {# Price formatting duplicated across 6 other templates #}
                <p style="font-size: 20px; font-weight: 700; color: #2563eb; margin-top: 8px;">
                    ${{ (product.priceCents / 100)|number_format(2) }}
                </p>

                {% if product.stock > 0 %}
                    <span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 9999px; font-size: 12px;">
                        In stock
                    </span>
                {% else %}
                    <span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 9999px; font-size: 12px;">
                        Out of stock
                    </span>
                {% endif %}

                {# The "primary button", hand-written for the 14th time #}
                <button
                    onclick="fetch('/api/cart/add', { method: 'POST', body: JSON.stringify({ id: {{ product.id }} }) }).then(() => location.reload())"
                    style="background: #2563eb; color: white; padding: 8px 16px; border-radius: 6px; border: none; width: 100%; margin-top: 16px; cursor: pointer;"
                    {% if product.stock == 0 %}disabled style="opacity: 0.5"{% endif %}
                >
                    Add to cart
                </button>
            </article>
        {% endfor %}
    </div>
</section>
```

### Why this template is fragile

It works. It renders the grid, handles stock state, adds to the cart. A designer looking at the page in production would find nothing wrong with it.

It is also debt accruing compound interest, for five separate reasons.

#### 1. No single source of truth

The blue `#2563eb`, the `6px` radius, the `8px 16px` spacing are **hardcoded** here and in thirteen other files. There is nowhere that "the primary button" is defined. Changing it means a global find-and-replace, with the certainty of missing some and introducing silent visual drift.

The consequence is measurable: the gap between the Figma mockup and production widens every sprint, until nobody trusts either one.

#### 2. Duplicated presentation logic

Price formatting (`priceCents / 100`, separators, currency symbol) is repeated everywhere a price appears. The day you add multi-currency or displayed tax, you have to find every occurrence. This is not business logic, it is presentation logic, and it deserves the same care.

#### 3. Rendering that cannot be tested or documented in isolation

To see what a disabled button looks like, you must: start the application, log in, navigate to the catalog, and find an out-of-stock product. There is no way to render **only** the button, in its six variants, in one second.

The result: rare states (error, loading, very long text, empty list) are never seen before they blow up in production.

#### 4. Visual coupled to business and transport

The button knows the `/api/cart/add` URL, the JSON payload shape, and decides to reload the page. A visual component has inherited network responsibilities. It is impossible to reuse this button elsewhere without dragging the cart along with it.

#### 5. No shared language between design and development

The designer talks about "the product card" and "the status chip". The code only knows `templates/catalog/list.html.twig`. This missing shared vocabulary turns every design review into a translation session.

> [!NOTE]
> These five symptoms are the exact interface-side counterpart of what we criticize in a monolithic controller on the server: mixed responsibilities, duplication, impossibility of testing in isolation. If you know [hexagonal architecture](/posts/hexagonal-architecture), you will recognize the same reflexes.

---

## 2. What is Atomic Design?

The goal is to stop designing pages and start designing a system. A page stops being a unit of design and becomes the result of assembling smaller components, themselves assembled from even smaller ones.

Brad Frost borrows his metaphor from chemistry: matter is made of atoms, which bond into molecules, which form organisms. None of the levels is arbitrary. Each one describes a different degree of complexity and specificity.

### The five levels

```mermaid
graph LR
    %% Styling
    classDef atom fill:#efa9f9,stroke:#333,stroke-width:2px;
    classDef molecule fill:#a9cbf9,stroke:#333,stroke-width:2px;
    classDef organism fill:#a9f9bf,stroke:#333,stroke-width:2px;
    classDef template fill:#f9efa9,stroke:#333,stroke-width:2px;
    classDef page fill:#f9c9a9,stroke:#333,stroke-width:2px;

    Atoms["<b>Atoms</b><br/>Button, Input, Label<br/>Icon, Badge, Heading"]
    Molecules["<b>Molecules</b><br/>SearchField, FormField<br/>PriceTag, StockBadge"]
    Organisms["<b>Organisms</b><br/>ProductCard, SiteHeader<br/>ProductGrid, CartSummary"]
    Templates["<b>Templates</b><br/>Layout skeleton<br/>Placeholder content"]
    Pages["<b>Pages</b><br/>Template + real data<br/>Route, SEO, state"]

    Atoms --> Molecules --> Organisms --> Templates --> Pages

    class Atoms atom;
    class Molecules molecule;
    class Organisms organism;
    class Templates template;
    class Pages page;
```

#### 1. Atoms

The indivisible building blocks: a button, an input, a label, an icon, a heading. An atom has no functional meaning on its own (an input without a label is useless), yet it carries the entire visual identity of the product.

- They contain no business logic.
- They know nothing of the API, the store, or the current route.
- They are entirely driven by their props or attributes.

#### 2. Molecules

A molecule is an assembly of atoms that together accomplish **one single coherent task**. A label + an input + an error message form a `FormField`. An input + a button form a `SearchField`.

This is the first level where the interface becomes *usable*. A molecule may carry local UI state (open/closed, hovered), but still no business logic.

#### 3. Organisms

An organism is a relatively complex, self-contained section of the interface: a site header, a product card, a results grid, a complete form. It combines molecules and atoms.

This is where **business vocabulary** legitimately appears: an organism may be called `ProductCard` and receive a `Product` object. It is product-specific, but remains reusable across pages.

#### 4. Templates

A template is a page skeleton: it defines the **layout** and the placement of organisms, without real data. It is the wireframe equivalent, but in code.

Its role is to validate structure, density, and responsive behavior independently of content.

#### 5. Pages

A page is the concrete instance of a template, fed with **real data**. It is the only level connected to the outside world: routing, data fetching, SEO metadata, global state.

It is also where the robustness of the system gets tested: what happens with a 200-character product name? with an empty list? with a missing image?

---

### The downward dependency law

Hexagonal architecture rests on dependency inversion. Atomic Design rests on a rule that is just as short, and violated just as often:

> [!IMPORTANT]
> **A component may only compose components of a strictly lower level, and must never know anything about its usage context.**

Two practical consequences follow, and they are what give the model its value:

**1. Dependencies only point downwards.** An atom knows no molecule. A molecule knows no organism. An organism never imports a page. This rule is statically verifiable, exactly like the layer rules of a hexagon (we will see how to automate it later).

**2. Purity increases as you descend.** The lower a component sits in the hierarchy, the more generic, stable, and reusable it is. The higher it sits, the more specific, volatile, and connected.

| Level | Business logic | Data access | Reusability | Rate of change |
|---|---|---|---|---|
| Atoms | ❌ Never | ❌ Never | Universal | Very rare |
| Molecules | ❌ Never | ❌ Never | High | Rare |
| Organisms | ⚠️ Presentation-level | ⚠️ Via props preferably | Medium | Regular |
| Templates | ❌ Never | ❌ Placeholder only | Low | Regular |
| Pages | ✅ Orchestration | ✅ Yes | None | Frequent |

This is exactly the same move as in a hexagon: **isolate what is stable from what is volatile**. The application core protects business rules from technical details; atoms protect visual identity from the whims of pages.

> [!NOTE]
> Brad Frost stresses a point that is often forgotten: Atomic Design **is not a linear process**. You do not design all the atoms first, then all the molecules. You constantly navigate between levels, often starting from a page mockup and extracting components from it. The model is a lens, not a sequential methodology.

The rest of the article refactors the spaghetti template into a system, building each level in both technologies side by side.

---

## 3. Level zero: design tokens

Before atoms, what atoms are made of. A blue button that hardcodes `#2563eb` is not an atom, it is a magic value in disguise.

Design tokens are the named values for color, spacing, typography, radius, and shadow. They are the contract between design and code.

#### In plain CSS, usable by Twig and Vue alike

```css
/* assets/styles/tokens.css */
:root {
    /* Semantic colors — never a raw color name inside components */
    --color-brand: #2563eb;
    --color-brand-hover: #1d4ed8;
    --color-surface: #ffffff;
    --color-text: #1a1a1a;
    --color-text-muted: #6b7280;
    --color-success-bg: #dcfce7;
    --color-success-text: #166534;
    --color-danger-bg: #fee2e2;
    --color-danger-text: #991b1b;

    /* Spacing scale — no arbitrary values */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-6: 1.5rem;

    /* Typography */
    --font-size-sm: 0.875rem;
    --font-size-base: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.5rem;

    /* Shapes */
    --radius-md: 0.375rem;
    --radius-full: 9999px;
}

[data-theme="dark"] {
    --color-surface: #111827;
    --color-text: #f9fafb;
    --color-text-muted: #9ca3af;
}
```

#### In UnoCSS, on the Vue side

```ts
// unocss.config.ts
import { defineConfig } from 'unocss'

export default defineConfig({
  theme: {
    colors: {
      brand: {
        DEFAULT: 'var(--color-brand)',
        hover: 'var(--color-brand-hover)',
      },
      surface: 'var(--color-surface)',
    },
  },
})
```

> [!TIP]
> The decisive test of a good token system: **searching for `#` inside the components folder must return no results**. Any literal color found in an atom is a token that has not been named yet. This is a trivial lint rule to write and surprisingly effective.

One important nuance: name your tokens by their **role** (`--color-danger-bg`), never by their appearance (`--color-red-100`). Otherwise the day red becomes orange, you end up with a token named `red` holding `#f97316`.

---

## 4. In practice: atoms

Time to refactor. That primary button, rewritten fourteen times, becomes one atom.

### Rules for designing an atom

An atom may only expose properties describing its appearance and its state, never its context. It consumes design tokens and nothing else. And it emits events rather than acting on them: `click`, not `addToCart`.

An atom never carries external margin, never touches a store, a route, or an API, and never bears a business name. `CheckoutButton` is a bad atom name.

> [!IMPORTANT]
> The no-external-margin rule is the most frequently violated, and the most expensive. An atom declaring `margin-bottom: 16px` imposes its layout on every parent. The day you place it in a horizontal toolbar, you end up fighting `margin-bottom: 0 !important`. *Internal* padding belongs to the atom; spacing *between* elements belongs to the container, ideally via `gap`.

### Symfony: the anonymous Twig component

Symfony UX Twig Components lets you declare a component with no PHP class at all as long as it has no logic. That is exactly an atom's situation.

```twig
{# templates/components/Atom/Button.html.twig #}
{% props variant = 'primary', size = 'md', type = 'button', disabled = false %}

{% set variants = {
    primary:   'bg-brand text-white hover:bg-brand-hover',
    secondary: 'bg-transparent text-brand border border-brand hover:bg-brand/5',
    ghost:     'bg-transparent text-muted hover:bg-black/5',
} %}

{% set sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-base px-4 py-2',
    lg: 'text-lg px-6 py-3',
} %}

<button
    type="{{ type }}"
    {{ disabled ? 'disabled' : '' }}
    {{ attributes.defaults({
        class: 'inline-flex items-center justify-center gap-2 rounded-md font-medium
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
                ' ~ variants[variant] ~ ' ' ~ sizes[size]
    }) }}
>
    {% block content %}{% endblock %}
</button>
```

Usage:

```twig
<twig:Atom:Button variant="secondary" size="sm">Cancel</twig:Atom:Button>
<twig:Atom:Button type="submit">Confirm</twig:Atom:Button>
```

Note `{{ attributes.defaults({...}) }}`. That is what lets the parent pass `data-*`, `aria-*`, or Stimulus attributes without the atom knowing they exist. Without it, every new requirement would add another prop to the atom.

### Vue 3: the same atom as an SFC

```vue
<!-- src/components/atoms/AButton.vue -->
<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const { variant = 'primary', size = 'md', disabled = false } = defineProps<Props>()

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-transparent text-brand border border-brand hover:bg-brand/5',
  ghost: 'bg-transparent text-muted hover:bg-black/5',
} as const

const sizes = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-4 py-2',
  lg: 'text-lg px-6 py-3',
} as const
</script>

<template>
  <button
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-md font-medium
           transition-colors disabled:opacity-50 disabled:cursor-not-allowed
           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    :class="[variants[variant], sizes[size]]"
  >
    <slot />
  </button>
</template>
```

Usage:

```vue
<AButton variant="secondary" size="sm">Cancel</AButton>
<AButton @click="submit">Confirm</AButton>
```

> [!NOTE]
> Both implementations are structurally identical: same props, same variants, same classes, same slot. Only the syntax differs. Atomic Design describes an architecture, not a technology, which is why a team moving from Twig to Vue can migrate component by component without rethinking the system.

### A second atom: the badge

```twig
{# templates/components/Atom/Badge.html.twig #}
{% props tone = 'neutral' %}

{% set tones = {
    neutral: 'bg-gray-100 text-gray-700',
    success: 'bg-success-bg text-success-text',
    danger:  'bg-danger-bg text-danger-text',
} %}

<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium {{ tones[tone] }}">
    {% block content %}{% endblock %}
</span>
```

```vue
<!-- src/components/atoms/ABadge.vue -->
<script setup lang="ts">
const { tone = 'neutral' } = defineProps<{
  tone?: 'neutral' | 'success' | 'danger'
}>()

const tones = {
  neutral: 'bg-gray-100 text-gray-700',
  success: 'bg-success-bg text-success-text',
  danger: 'bg-danger-bg text-danger-text',
} as const
</script>

<template>
  <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium" :class="tones[tone]">
    <slot />
  </span>
</template>
```

Note the naming: `tone="danger"`, not `color="red"`. The atom exposes an intent, not a visual value. The day design decides "danger" becomes orange, no caller changes.

---

## 5. Molecules: assembling for a task

A molecule combines atoms to accomplish one thing. That is also the most reliable test for telling a molecule from an organism: if you cannot describe its role in one sentence without saying "and", it is probably an organism.

### `StockBadge`, from raw data to visual intent

The legacy template had an `if/else` on stock, duplicated everywhere. That is a molecule: it translates data into a visual representation.

```twig
{# templates/components/Molecule/StockBadge.html.twig #}
{% props stock %}

{% if stock > 10 %}
    <twig:Atom:Badge tone="success">In stock</twig:Atom:Badge>
{% elseif stock > 0 %}
    <twig:Atom:Badge tone="neutral">Only {{ stock }} left</twig:Atom:Badge>
{% else %}
    <twig:Atom:Badge tone="danger">Out of stock</twig:Atom:Badge>
{% endif %}
```

```vue
<!-- src/components/molecules/MStockBadge.vue -->
<script setup lang="ts">
const { stock } = defineProps<{ stock: number }>()
</script>

<template>
  <ABadge v-if="stock > 10" tone="success">In stock</ABadge>
  <ABadge v-else-if="stock > 0" tone="neutral">Only {{ stock }} left</ABadge>
  <ABadge v-else tone="danger">Out of stock</ABadge>
</template>
```

> [!TIP]
> The `> 10` threshold is a business rule that has crept into a molecule. Strictly, that computation belongs to the domain, and the molecule should receive an already-determined status (`status: 'in_stock' | 'low' | 'out'`). It is a common pragmatic trade-off: tolerable for a trivial display rule, worth refusing as soon as the threshold becomes configurable or customer-dependent.

### `PriceTag`, centralizing formatting

```twig
{# templates/components/Molecule/PriceTag.html.twig #}
{% props amountCents, currency = 'USD', size = 'md' %}

{% set sizes = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' } %}

<p class="font-bold text-brand {{ sizes[size] }}">
    {{ (amountCents / 100)|format_currency(currency) }}
</p>
```

```vue
<!-- src/components/molecules/MPriceTag.vue -->
<script setup lang="ts">
const { amountCents, currency = 'USD', size = 'md' } = defineProps<{
  amountCents: number
  currency?: string
  size?: 'sm' | 'md' | 'lg'
}>()

const sizes = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' } as const

const formatted = computed(() =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100),
)
</script>

<template>
  <p class="font-bold text-brand" :class="sizes[size]">{{ formatted }}</p>
</template>
```

Currency formatting now exists in exactly one place per stack. Adding a currency, changing the locale, or displaying "excl./incl. tax" happens in a single file.

### `FormField`, the textbook case

```vue
<!-- src/components/molecules/MFormField.vue -->
<script setup lang="ts">
const { label, error, hint, required = false } = defineProps<{
  label: string
  error?: string
  hint?: string
  required?: boolean
}>()

const id = useId()
const describedBy = computed(() =>
  [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined,
)
</script>

<template>
  <div class="flex flex-col gap-1">
    <ALabel :for="id" :required="required">{{ label }}</ALabel>

    <slot :id="id" :described-by="describedBy" :invalid="!!error" />

    <p v-if="hint && !error" :id="`${id}-hint`" class="text-sm text-muted">
      {{ hint }}
    </p>
    <p v-if="error" :id="`${id}-error`" class="text-sm text-danger-text" role="alert">
      {{ error }}
    </p>
  </div>
</template>
```

This molecule carries a responsibility only this level can carry: relational accessibility. The link between label and field (`for`/`id`), and between field and error message (`aria-describedby`), only exists at assembly time. No atom can handle it alone.

That is an underrated argument for the whole model. Correct accessibility is structurally impossible to guarantee in a system where every page reassembles its fields by hand. Centralized in a molecule, it is earned once.

---

## 6. Organisms: business enters the scene

An organism is a self-contained section of the interface. It is the first level allowed to know the shape of business data.

### `ProductCard`

```twig
{# templates/components/Organism/ProductCard.html.twig #}
{% props product %}

<article class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-surface p-4 shadow-sm">
    <img
        src="{{ product.imageUrl }}"
        alt="{{ product.name }}"
        loading="lazy"
        class="h-48 w-full rounded object-cover"
    >

    <div class="flex items-start justify-between gap-2">
        <h3 class="text-lg font-semibold">{{ product.name }}</h3>
        <twig:Molecule:StockBadge :stock="product.stock" />
    </div>

    <p class="text-sm text-muted">{{ product.description|u.truncate(80, '…') }}</p>

    <twig:Molecule:PriceTag :amountCents="product.priceCents" />

    <twig:Atom:Button
        class="mt-auto w-full"
        :disabled="product.stock == 0"
        data-action="cart#add"
        data-cart-product-id-param="{{ product.id }}"
    >
        Add to cart
    </twig:Atom:Button>
</article>
```

```vue
<!-- src/components/organisms/OProductCard.vue -->
<script setup lang="ts">
import type { Product } from '~/types/catalog'

const { product } = defineProps<{ product: Product }>()
const emit = defineEmits<{ addToCart: [productId: string] }>()
</script>

<template>
  <article class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-surface p-4 shadow-sm">
    <img
      :src="product.imageUrl"
      :alt="product.name"
      loading="lazy"
      class="h-48 w-full rounded object-cover"
    >

    <div class="flex items-start justify-between gap-2">
      <h3 class="text-lg font-semibold">{{ product.name }}</h3>
      <MStockBadge :stock="product.stock" />
    </div>

    <p class="text-sm text-muted line-clamp-2">{{ product.description }}</p>

    <MPriceTag :amount-cents="product.priceCents" />

    <AButton
      class="mt-auto w-full"
      :disabled="product.stock === 0"
      @click="emit('addToCart', product.id)"
    >
      Add to cart
    </AButton>
  </article>
</template>
```

Two details are worth stopping on.

The organism does not trigger the action, it signals it. On the Vue side it emits `addToCart`; on the Twig side it delegates to a Stimulus controller through attributes. Either way the organism has no idea `/api/cart/add` exists, so it stays renderable in documentation, in a test, or in a mockup with no backend running. That is the hexagon's dependency inversion moved to the interface: the component declares what it needs, the caller supplies the implementation.

The only `margin` in the file is `mt-auto` on the button, and it is legitimate, because the card is the parent deciding to push its own button to the bottom. The no-external-margin rule governs a component's relationship with *its* parent, not what happens inside its own boundaries.

### `ProductGrid`

```vue
<!-- src/components/organisms/OProductGrid.vue -->
<script setup lang="ts">
import type { Product } from '~/types/catalog'

const { products, loading = false } = defineProps<{
  products: Product[]
  loading?: boolean
}>()
defineEmits<{ addToCart: [productId: string] }>()
</script>

<template>
  <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <MCardSkeleton v-for="i in 6" :key="i" />
  </div>

  <MEmptyState
    v-else-if="products.length === 0"
    title="No products"
    description="Try widening your search criteria."
  />

  <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <OProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
      @add-to-cart="$emit('addToCart', $event)"
    />
  </div>
</template>
```

This organism carries something the page should not have to repeat: the three states of a collection, loading, empty, and populated. In the legacy code the empty and loading states simply did not exist. They showed up as a blank page. Encoded in the organism, they become impossible to forget.

---

## 7. Templates and pages: structure, then data

### The template: layout without content

```vue
<!-- src/components/templates/TCatalogLayout.vue -->
<template>
  <div class="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[16rem_1fr]">
    <aside class="hidden lg:block">
      <slot name="filters" />
    </aside>

    <main class="flex flex-col gap-6">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <slot name="title" />
        <slot name="toolbar" />
      </header>

      <slot name="results" />

      <footer class="flex justify-center">
        <slot name="pagination" />
      </footer>
    </main>
  </div>
</template>
```

This file contains no data, no imports, no logic. It describes zones and their responsive behavior, nothing else. You can validate it with gray blocks before the first organism even exists.

The Twig equivalent uses blocks, which the language already provides:

```twig
{# templates/components/Template/CatalogLayout.html.twig #}
<div class="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[16rem_1fr]">
    <aside class="hidden lg:block">
        {% block filters %}{% endblock %}
    </aside>

    <main class="flex flex-col gap-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
            {% block title %}{% endblock %}
            {% block toolbar %}{% endblock %}
        </header>

        {% block results %}{% endblock %}

        <footer class="flex justify-center">
            {% block pagination %}{% endblock %}
        </footer>
    </main>
</div>
```

### The page: the only point of contact with the outside world

```vue
<!-- pages/catalog.vue -->
<script setup lang="ts">
const { products, loading, filters } = useCatalog()
const cart = useCartStore()

useHead({ title: 'Catalog — Our products' })
</script>

<template>
  <TCatalogLayout>
    <template #filters>
      <OFilterPanel v-model="filters" />
    </template>

    <template #title>
      <AHeading level="1">Our products</AHeading>
    </template>

    <template #toolbar>
      <MSortSelect v-model="filters.sort" />
    </template>

    <template #results>
      <OProductGrid
        :products="products"
        :loading="loading"
        @add-to-cart="cart.add"
      />
    </template>

    <template #pagination>
      <MPagination v-model="filters.page" :total="products.length" />
    </template>
  </TCatalogLayout>
</template>
```

The page has become a wiring file. Not one CSS class, not one `if`, not one formatting call. It plugs real data into an existing structure, the same way an infrastructure controller plugs an HTTP request into a use case.

Compare it with the template from chapter 1. Forty-five lines of inline styles, formatting, conditionals, and network calls became a declaration you can read at a glance.

---

## 8. Directory structure and conventions

### Directory structure

#### Symfony side

```text
templates/
├── components/
│   ├── Atom/
│   │   ├── Button.html.twig
│   │   ├── Badge.html.twig
│   │   ├── Input.html.twig
│   │   └── Label.html.twig
│   ├── Molecule/
│   │   ├── StockBadge.html.twig
│   │   ├── PriceTag.html.twig
│   │   └── FormField.html.twig
│   ├── Organism/
│   │   ├── ProductCard.html.twig
│   │   └── SiteHeader.html.twig
│   └── Template/
│       └── CatalogLayout.html.twig
└── pages/
    └── catalog/
        └── list.html.twig

src/Twig/Components/          <-- Only components that need logic
├── Molecule/
│   └── SearchField.php
└── Organism/
    └── CartSummary.php       <-- Live Component (server-side state)
```

#### Vue side

```text
src/components/
├── atoms/
│   ├── AButton.vue
│   ├── ABadge.vue
│   └── AInput.vue
├── molecules/
│   ├── MStockBadge.vue
│   ├── MPriceTag.vue
│   └── MFormField.vue
├── organisms/
│   ├── OProductCard.vue
│   └── OProductGrid.vue
└── templates/
    └── TCatalogLayout.vue

pages/
└── catalog.vue               <-- The "Page" level, handled by the router
```

The single-letter prefix (`A`/`M`/`O`/`T`) is a debated convention. Its advantage is that a component's level is visible where it is used, without opening a file. Reading `<OProductCard>` inside `AButton.vue` signals a violation by eye, during review.

Its drawback is that renaming a component whose level changes touches every caller. That is precisely what you want. A level change *is* an architectural change, and it deserves to be visible.

### Naming conventions

| Level | Named after | Valid examples | Invalid examples |
|---|---|---|---|
| Atom | Its shape | `Button`, `Input`, `Icon` | `CheckoutButton`, `UserAvatar` |
| Molecule | Its task | `SearchField`, `PriceTag` | `ProductThing`, `Wrapper` |
| Organism | Its business concept | `ProductCard`, `SiteHeader` | `Section2`, `BigBox` |
| Template | Its layout | `CatalogLayout`, `ArticleLayout` | `Page1`, `MainTemplate` |

The underlying rule is that a component's name must reflect its level of abstraction. An atom named `CheckoutButton` is an admission that it knows its context, therefore that it is not reusable, therefore that it is not an atom.

---

## 9. Going further

### Testing components in isolation

Decoupling components from their context makes possible what was impossible in chapter 1: testing them without starting the application.

#### Vue side: Vitest and Testing Library

```ts
// src/components/molecules/MStockBadge.test.ts
import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import MStockBadge from './MStockBadge.vue'

describe('mStockBadge', () => {
  it('signals availability above 10 units', () => {
    render(MStockBadge, { props: { stock: 42 } })
    expect(screen.getByText('In stock')).toBeTruthy()
  })

  it('warns on low stock', () => {
    render(MStockBadge, { props: { stock: 3 } })
    expect(screen.getByText('Only 3 left')).toBeTruthy()
  })

  it('signals depletion at zero', () => {
    render(MStockBadge, { props: { stock: 0 } })
    expect(screen.getByText('Out of stock')).toBeTruthy()
  })
})
```

#### Symfony side: `InteractsWithTwigComponents`

Symfony UX ships a dedicated trait for rendering a component in isolation inside a test:

```php
<?php

declare(strict_types=1);

namespace App\Tests\Twig\Components;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class ButtonTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testRendersPrimaryVariantByDefault(): void
    {
        $rendered = $this->renderTwigComponent('Atom:Button', ['type' => 'submit']);

        self::assertStringContainsString('bg-brand', (string) $rendered);
        self::assertStringContainsString('type="submit"', (string) $rendered);
    }

    public function testDisabledStateIsExposedToAssistiveTechnology(): void
    {
        $rendered = $this->renderTwigComponent('Atom:Button', ['disabled' => true]);

        self::assertStringContainsString('disabled', (string) $rendered);
    }
}
```

> [!TIP]
> These tests run in a few milliseconds and require no database, no browser, no authenticated session. On a fifty-component system the full suite finishes in under three seconds, which is the feedback loop you need in order to refactor without fear.

### Documenting: the system's showroom

A design system nobody consults gets reinvented every sprint. Two approaches, depending on the stack.

On the Vue side, Storybook (or Histoire) renders each component in all its variants:

```ts
// src/components/atoms/AButton.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3'
import AButton from './AButton.vue'

const meta = {
  title: 'Atoms/Button',
  component: AButton,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof AButton>

export default meta

export const Primary: StoryObj<typeof meta> = {
  args: { variant: 'primary' },
  render: args => ({
    components: { AButton },
    setup: () => ({ args }),
    template: '<AButton v-bind="args">Add to cart</AButton>',
  }),
}

export const Disabled: StoryObj<typeof meta> = { args: { disabled: true } }
```

On the Symfony side, integrating Storybook is possible but heavy. Exposing a showroom route, restricted to the development environment, is far cheaper:

```php
<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class DesignSystemController extends AbstractController
{
    #[Route('/_design-system', name: 'design_system', env: 'dev')]
    public function index(): Response
    {
        return $this->render('design_system/index.html.twig');
    }
}
```

The associated template renders every atom in all its combinations. It is poorer than Storybook, but it takes an hour to set up, adds no build dependency, and covers 90% of the need: seeing every state at a glance.

### Enforcing the architecture automatically

The downward dependency law does not survive delivery pressure if code review is the only thing checking it. As with a hexagon, it has to be blocking in CI.

#### TypeScript side: `eslint-plugin-boundaries`

```js
// eslint.config.js
import boundaries from 'eslint-plugin-boundaries'

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'atoms', pattern: 'src/components/atoms/*' },
        { type: 'molecules', pattern: 'src/components/molecules/*' },
        { type: 'organisms', pattern: 'src/components/organisms/*' },
        { type: 'templates', pattern: 'src/components/templates/*' },
        { type: 'pages', pattern: 'pages/*' },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // An atom composes nothing: it is terminal.
          { from: 'atoms', allow: [] },
          { from: 'molecules', allow: ['atoms'] },
          { from: 'organisms', allow: ['atoms', 'molecules'] },
          { from: 'templates', allow: [] },
          { from: 'pages', allow: ['atoms', 'molecules', 'organisms', 'templates'] },
        ],
      }],
    },
  },
]
```

Any attempt to import an organism from an atom now fails the lint, and therefore the CI.

#### PHP side: Deptrac, with an important caveat

Deptrac reasons about PHP namespaces, so it covers components backed by a class perfectly:

```yaml
# deptrac.yaml
deptrac:
  paths:
    - src/Twig/Components/
  layers:
    - name: Atom
      collectors:
        - { type: directory, value: src/Twig/Components/Atom/.* }
    - name: Molecule
      collectors:
        - { type: directory, value: src/Twig/Components/Molecule/.* }
    - name: Organism
      collectors:
        - { type: directory, value: src/Twig/Components/Organism/.* }
  ruleset:
    Atom: ~              # An atom depends on no other component
    Molecule:
      - Atom
    Organism:
      - Atom
      - Molecule
```

> [!WARNING]
> **The limitation to know about:** an *anonymous* Twig component has no PHP class. Its dependency lives in the `<twig:Organism:ProductCard />` tag inside a `.twig` file, completely invisible to Deptrac. And the atoms and molecules, the ones most critical to protect, are precisely the ones most often anonymous.

A complementary check, trivial but effective, fills the gap:

```bash
#!/usr/bin/env bash
# bin/check-atomic-boundaries.sh
set -euo pipefail

status=0

# An atom must not reference any higher-level component.
if grep -rlE '<twig:(Molecule|Organism|Template):' templates/components/Atom/ 2>/dev/null; then
    echo "❌ An atom composes a higher-level component." >&2
    status=1
fi

# A molecule must reference neither organisms nor templates.
if grep -rlE '<twig:(Organism|Template):' templates/components/Molecule/ 2>/dev/null; then
    echo "❌ A molecule composes a higher-level component." >&2
    status=1
fi

# No literal color may remain inside components.
if grep -rnE '#[0-9a-fA-F]{3,8}\b' templates/components/ 2>/dev/null; then
    echo "❌ Literal color detected: use a design token." >&2
    status=1
fi

exit $status
```

Twenty lines of shell wired into CI beat a convention everyone knows and nobody applies.

### The most expensive anti-patterns

#### 1. Taxonomy paralysis

The symptom: a team debating for thirty minutes whether `UserAvatar` is a molecule or an organism.

This is the most frequent trap, and the most sterile. Brad Frost himself repeats it: taxonomy is a communication tool, not a science. Adopt a de-escalation rule. Past two minutes of debate, put the component at the higher level and move on. A misclassified component costs one file move; a weekly classification meeting costs a project.

#### 2. The omniscient atom

```vue
<!-- ❌ Twenty-three boolean props: this button has absorbed every edge case -->
<AButton
  :is-loading="true" :is-icon-only="false" :is-full-width="true"
  :has-badge="true" :badge-count="3" :is-dropdown-trigger="false"
  :show-spinner-left="true" ...
/>
```

Every edge case added a prop, until the atom became unreadable and untestable, with 2²³ theoretical combinations. The remedy is composition over configuration: a small set of semantic variants, and slots for everything else.

```vue
<!-- ✅ Variation goes through content, not props -->
<AButton variant="primary" size="lg" class="w-full">
  <ASpinner v-if="pending" />
  <IconCart v-else />
  Add to cart
</AButton>
```

#### 3. The ghost molecule

A file `MButtonWrapper.vue` whose entire content is `<AButton><slot /></AButton>`. It adds nothing, adds one level of indirection to navigation, and muddies the component tree. If a component adds neither structure, nor behavior, nor semantics, it should not exist.

#### 4. Prop drilling across levels

Passing `currentUser` from the page down to an atom, through four levels, means either the decomposition is wrong or a context mechanism is missing (`provide`/`inject` in Vue, global context variables in Twig). An atom that needs to know the current user is, by definition, not an atom.

#### 5. Premature business naming

`<CheckoutSubmitButton>` sitting in `atoms/`. The name betrays the violation: this atom knows about the checkout funnel. The correct shape is a generic `<AButton>`, used by an `<OCheckoutForm>` organism which legitimately carries the business vocabulary.

### Relationships with other approaches

Atomic Design coexists with several neighboring models, and it helps to know which one answers which question.

Feature-Sliced Design organizes code by *feature* rather than by level of abstraction. The two do not compete. In large applications you frequently see a cross-cutting atomic design system (FSD's `shared/ui` are literally atoms and molecules) with a feature-based split above it, and that is probably the most solid combination at scale.

ITCSS answers the same intuition on the CSS side: organize by increasing specificity, from generic to specific. With an atomic engine like UnoCSS or Tailwind, the question largely loses relevance, since tokens and component variants replace the cascade.

Then there are three-level systems. Many mature teams flatten the model into `primitives / components / features`, merging atoms with molecules on one side and organisms with templates on the other. Perfectly defensible: the value lies in the downward dependency law, not in the exact number of tiers. Five levels on a thirty-component project is ceremony.

---

### When to adopt it, and when not to

No architecture is a silver bullet. Atomic Design buys real things and costs real things.

What you get: a button with one definition and therefore one possible appearance. Velocity that starts low and climbs, since the first pages are slow to produce and every one after that is faster, the vocabulary already being there. Designers and developers naming the same thing the same way, which removes an entire layer of misunderstanding. Components that render in isolation, in every state, without starting the app. And accessibility solved once, in the molecules: ARIA relationships, focus management, states, instead of reinvented page by page.

What it costs: dozens of files before the first page renders, even for a modest system. Indirection, since understanding how a page renders now means opening four or five files, and the reader loses the overview the monolithic template gave. A standing temptation to anticipate variants that will never be used. And continuous discipline: without automated enforcement, the downward dependency law degrades within months.

Use it when the application has many screens sharing a visual vocabulary, which is most SaaS products, admin panels, and e-commerce. Use it when several front-end developers, or several teams, work on one product. Use it on products meant to last years, where design evolves through successive redesigns. And use it where visual consistency is contractual or regulatory: a strict brand guideline, or medical software where ergonomics are part of the risk analysis.

Skip it for a brochure site of a few pages, where the system costs more than the pages it serves, and for a throwaway prototype, where speed wins and a system can be extracted later. Skip it if a third-party design system is already in place: with Vuetify, Bootstrap, or an in-house library, your atoms exist, so start at the molecule level. Recreating an `<AButton>` on top of a third-party component is re-abstraction and nothing else. And skip it for a single highly specialized interface, like a one-screen real-time dashboard, which has nothing to share with anything.

---

## Conclusion

Organizing the interface into levels of increasing specificity, and forcing dependencies to point downwards, got us four things.

The primary button now exists in exactly one copy, so changing its border radius means editing one file instead of twenty-three. Every level renders in isolation, in milliseconds, with no database and no browser. The same system went into Twig and into Vue with an identical structure, which says the model describes an architecture rather than a framework. And designers and developers finally refer to the same objects by the same names.

Retracing the path:

| | Before (monolithic page) | After (Atomic Design) |
|---|---|---|
| Change the brand color | Find/replace across 23 files | One token |
| See a disabled button | Boot the app, find an out-of-stock product | One story, one second |
| Price formatting | Duplicated 7 times | One molecule |
| Empty state of a list | Non-existent (blank page) | Encoded in the organism |
| Form accessibility | Redone for every field | Earned in `FormField` |
| Add a similar page | Copy-paste 200 lines | Assemble 6 organisms |
| Verify the architecture | Code review, by eye | Blocking lint in CI |

Atomic Design demands more files and more discipline upfront. In return, the interface, traditionally the fastest-degrading asset in the codebase, becomes a system whose value accumulates instead of eroding.

If the reasoning felt familiar, that is no accident. It is the same as [hexagonal architecture](/posts/hexagonal-architecture): identify what is stable, isolate it from what is volatile, and make the dependencies point towards the stable. Atoms are to design what the domain is to business.
