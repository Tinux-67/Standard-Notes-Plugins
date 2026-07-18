import { TestData } from './mock-notes';

export const TEST_DATA: TestData[] = [
  {
    title: 'Work Notes',
    text: 'This is a work-related note with multiple tags',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Work Notes',
      text: 'This is a work-related note with multiple tags',
      tags: ['work', 'important', 'projects']
    }
  },
  {
    title: 'Personal Goals',
    text: 'My personal goals for this year',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Personal Goals',
      text: 'My personal goals for this year',
      tags: ['personal', 'goals', 'important']
    }
  },
  {
    title: 'Meeting Notes',
    text: 'Notes from the team meeting',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Meeting Notes',
      text: 'Notes from the team meeting',
      tags: ['work', 'meeting', 'team']
    }
  },
  {
    title: 'Project Plan',
    text: 'Detailed plan for the new project',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Project Plan',
      text: 'Detailed plan for the new project',
      tags: ['work', 'projects', 'planning']
    }
  },
  {
    title: 'Shopping List',
    text: 'Items to buy this week',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Shopping List',
      text: 'Items to buy this week',
      tags: ['personal', 'shopping']
    }
  },
  {
    title: 'Book Recommendations',
    text: 'Books I want to read',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Book Recommendations',
      text: 'Books I want to read',
      tags: ['personal', 'books', 'reading']
    }
  },
  {
    title: 'Technical Documentation',
    text: 'API documentation and technical details',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Technical Documentation',
      text: 'API documentation and technical details',
      tags: ['work', 'technical', 'documentation']
    }
  },
  {
    title: 'Travel Plans',
    text: 'Upcoming travel itinerary',
    meta: {
      spacing: 'Default'
    },
    content: {
      title: 'Travel Plans',
      text: 'Upcoming travel itinerary',
      tags: ['personal', 'travel', 'vacation']
    }
  }
];
