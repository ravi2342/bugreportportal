require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
  __internal: { engine: { type: 'binary' } }
});

async function seed() {
  await prisma.comment.deleteMany();
  await prisma.bugReport.deleteMany();

  const scenarios = [
    {
      title: 'Checkout button unresponsive on Safari',
      description: 'Users cannot complete checkout on Safari 17. The button appears active but click events do not fire after address autofill.',
      priority: 'Critical',
      reporter: 'anjali',
      assignee: 'dev-team',
      status: 'IN_PROGRESS',
      comments: [
        { author: 'anjali', text: 'Issue reproduced on macOS and iOS Safari.' },
        { author: 'dev-team', text: 'Root cause likely tied to disabled state not resetting after validation.' }
        ],
        activities: [
          { actor: 'anjali', action: 'Incident created', details: 'Priority Critical | Assigned to dev-team' },
          { actor: 'dev-team', action: 'Status changed', details: 'Open -> In Progress' },
          { actor: 'anjali', action: 'Comment added', details: 'Issue reproduced on macOS and iOS Safari.' }
      ]
    },
    {
      title: 'Search results show stale ticket counts',
      description: 'Dashboard counters and incidents list disagree after quick status updates. Counts update after hard refresh only.',
      priority: 'High',
      reporter: 'rahul',
      assignee: 'qa-team',
      status: 'OPEN',
      comments: [
        { author: 'rahul', text: 'Observed during regression pass for release 2.4.' }
        ],
        activities: [
          { actor: 'rahul', action: 'Incident created', details: 'Priority High | Assigned to qa-team' },
          { actor: 'rahul', action: 'Comment added', details: 'Observed during regression pass for release 2.4.' }
      ]
    },
    {
      title: 'Email notification delay for reassigned incidents',
      description: 'Assignee change events are reflected in UI, but notification emails are delayed by 10 to 15 minutes for some users.',
      priority: 'Medium',
      reporter: 'maria',
      assignee: 'support-team',
      status: 'DONE',
      comments: [
        { author: 'support-team', text: 'Confirmed delay in staging queue, not seen in local mailhog.' },
        { author: 'maria', text: 'Closing for demo environment, production investigation tracked separately.' }
        ],
        activities: [
          { actor: 'maria', action: 'Incident created', details: 'Priority Medium | Assigned to support-team' },
          { actor: 'support-team', action: 'Status changed', details: 'Open -> In Progress' },
          { actor: 'maria', action: 'Status changed', details: 'In Progress -> Done' }
      ]
    },
    {
      title: 'Attachment preview broken for large PNG files',
      description: 'Preview pane fails for PNG files over 8MB while upload succeeds. Thumbnail area remains blank.',
      priority: 'Low',
      reporter: 'guest',
      assignee: null,
      status: 'OPEN',
        comments: [],
        activities: [
          { actor: 'anonymous', action: 'Incident created', details: 'Priority Low' }
        ]
    }
  ];

  for (const scenario of scenarios) {
      const { comments, activities, ...reportData } = scenario;
    await prisma.bugReport.create({
      data: {
        ...reportData,
        comments: comments.length
          ? {
              create: comments
            }
            : undefined,
          activities: activities.length
            ? {
                create: activities
              }
            : undefined
      }
    });
  }
}

seed()
  .then(async () => {
    console.log('Demo seed complete.');
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Demo seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
