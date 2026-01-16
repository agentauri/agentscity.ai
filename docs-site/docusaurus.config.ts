import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'SimAgents',
  tagline: 'A world where AI agents live, interact, and evolve',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://doc.simagents.io',
  baseUrl: '/',

  organizationName: 'agentauri',
  projectName: 'simagents.io',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs/public', // Source from docs/public instead of docs-site/docs
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Docs at root
          editUrl: 'https://github.com/agentauri/simagents.io/tree/main/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/simagents-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SimAgents',
      logo: {
        alt: 'SimAgents Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/agentauri/simagents.io',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'API Reference',
              to: '/api-reference',
            },
            {
              label: 'Research Guide',
              to: '/research-guide',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/agentauri/simagents.io',
            },
            {
              label: 'Full PRD',
              href: 'https://github.com/agentauri/simagents.io/blob/main/docs/PRD.md',
            },
            {
              label: 'Scientific Framework',
              href: 'https://github.com/agentauri/simagents.io/blob/main/docs/appendix/scientific-framework.md',
            },
          ],
        },
        {
          title: 'Technical',
          items: [
            {
              label: 'Stack Rationale',
              href: 'https://github.com/agentauri/simagents.io/blob/main/docs/appendix/stack-rationale.md',
            },
            {
              label: 'Roadmap',
              href: 'https://github.com/agentauri/simagents.io/blob/main/ROADMAP.md',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AgentAuri. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
