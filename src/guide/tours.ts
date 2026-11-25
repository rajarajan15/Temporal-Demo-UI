import type { Tenant } from '../api/types';

export interface TourStep {
  /** Route to show for this step. Omit to stay on the current page. */
  route?: (tenant: Tenant) => string;
  /** `data-tour` value of the element to spotlight. Omit for a centred message. */
  target?: string;
  title: string;
  body: string;
  /** Skip the step quietly if its target isn't on the page (e.g. no review pending). */
  optional?: boolean;
}

export type TourId = 'main' | 'request';

export const TOURS: Record<TourId, { name: string; steps: TourStep[] }> = {
  main: {
    name: 'Getting around',
    steps: [
      {
        route: (t) => `/${t}`,
        title: 'Welcome to the Card Issuance Console',
        body: 'This one-minute tour shows you how to issue a virtual card, follow its progress, and step in when a request needs a decision.',
      },
      {
        target: 'bank',
        title: 'Pick the bank you work for',
        body: 'Everything you see and create belongs to the selected bank. Switch here at any time.',
      },
      {
        target: 'checklist',
        optional: true,
        title: 'Your getting-started checklist',
        body: 'Five short tasks that cover everything the console does. Each one has a button that takes you straight there.',
      },
      {
        target: 'new-card',
        title: 'Issue a card from anywhere',
        body: 'This button is always in the top bar. Let\'s see what the form looks like.',
      },
      {
        route: (t) => `/${t}/new`,
        target: 'scenarios',
        title: 'Choose what should happen',
        body: 'This is a test environment, so you decide the outcome. Pick "Approved" for a normal card, or try a review or a rejection.',
      },
      {
        target: 'card-details',
        title: 'Card details are prefilled',
        body: 'Test values are already filled in. Change them if you like. You can\'t enter real card numbers here.',
      },
      {
        target: 'summary',
        title: 'Check and issue',
        body: 'The summary shows what will be created and what to expect. Press "Issue card" and you\'ll go straight to its live progress.',
      },
      {
        route: (t) => `/${t}`,
        target: 'attention',
        title: 'Requests that need you',
        body: 'When a request needs an operator decision (approve, reject, retry or cancel), or manual cleanup, it appears here and in the badge on Requests.',
      },
      {
        target: 'nav-requests',
        title: 'All your requests',
        body: 'Every request created in this browser, with live status. You can also open any request by its ID.',
      },
      {
        target: 'nav-recon',
        title: 'Reconciliation',
        body: 'Compares the card processor\'s records with the platform\'s and lists any mismatches.',
      },
      {
        target: 'nav-sim',
        title: 'Simulator',
        body: 'Make the test services slow, fail or decline, then issue a card to see how the system recovers.',
      },
      {
        target: 'guide-button',
        title: 'Help is always here',
        body: 'Open the guide for how-tos, a glossary of statuses, and to replay this tour. Shortcut: press ?.',
      },
    ],
  },
  request: {
    name: 'This request page',
    steps: [
      {
        target: 'status-hero',
        title: 'What\'s happening now',
        body: 'This banner explains the request\'s current state in plain words and what, if anything, you need to do.',
      },
      {
        target: 'review',
        optional: true,
        title: 'Make a decision',
        body: 'This request is paused until an operator decides. Only the choices that make sense for this situation are shown.',
      },
      {
        target: 'timeline',
        title: 'Live progress',
        body: 'Each step of issuing the card, updated every second. If something fails after the card is created, undo steps appear at the bottom.',
      },
      {
        target: 'tech-toggle',
        title: 'Technical details',
        body: 'Turn this on to see step codes, timings, error codes and a link to the workflow in Temporal.',
      },
      {
        target: 'actions',
        optional: true,
        title: 'What you can do',
        body: 'Cancel a request until its card is active. Once it\'s active, you can reissue the card if it\'s lost, stolen, damaged or expired.',
      },
    ],
  },
};
