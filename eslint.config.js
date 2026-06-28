// @ts-check
import antfu from '@antfu/eslint-config'

const cfg = antfu(
  {
    formatters: true,
    pnpm: true,
  },
).setDefaultIgnores((ignores) => [
  ...ignores,
  '**/_bmad/**',
  '**/.specify/**',
  '**/.github/agents/bmad-*.agent.md',
  '**/.github/agents/speckit*.agent.md',
  '**/.github/prompts/speckit*.prompt.md',
  '**/.agent/**',
  '**/.agents/**',
]).removeRules(
  'no-labels',
  'no-lone-blocks',
  'no-restricted-syntax',
  'node/prefer-global/buffer',
  'node/prefer-global/process',
  'prefer-rest-params',
  'symbol-description',
  'ts/ban-types',
  'ts/no-empty-object-type',
  'ts/no-invalid-this',
  'ts/no-unnecessary-type-constraint',
  'vue/no-template-shadow',
  'vue/no-v-text-v-html-on-component',
  'e18e/prefer-static-regex',
  'markdown/heading-increment',
  'markdown/require-alt-text',
)

const _out = cfg.toConfigs()
const configs = Array.isArray(_out)
  ? _out.map((c) => ({
      ...c,
      ignores: [
        ...(c.ignores || []),
        '**/_bmad/**',
        '**/.specify/**',
        '**/.github/agents/bmad-*.agent.md',
        '**/.github/agents/speckit*.agent.md',
        '**/.github/prompts/speckit*.prompt.md',
        '**/.agent/**',
        '**/.agents/**',
      ],
    }))
  : [
      {
        ...(_out || {}),
        ignores: [
          ...((_out && _out.ignores) || []),
          '**/_bmad/**',
          '**/.specify/**',
          '**/.github/agents/bmad-*.agent.md',
          '**/.github/agents/speckit*.agent.md',
          '**/.github/prompts/speckit*.prompt.md',
          '**/.agent/**',
          '**/.agents/**',
        ],
      },
    ]

export default configs
