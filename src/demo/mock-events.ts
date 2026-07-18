export const REGISTERED_EVENT = {
  action: 'register',
  componentData: {}
};

export const STREAM_EVENT_DATA = {
  action: 'stream-context-item',
  context: 'editor',
  item: {
    uuid: '12345',
    content_type: 'Note',
    content: {
      title: '',
      text: '',
      tags: [],
      editorIdentifier: 'dev.tinux67.tag-visualizer',
      appData: {
        'dev.tinux67.tag-visualizer': {}
      }
    }
  }
};
