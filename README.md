# Standard Notes Tag Relationship Visualizer Plugin

A Standard Notes plugin that visualizes the relationship between notes based on their tags. This plugin provides both a graph view and a list view, with powerful filter and search functionality to help you understand how your notes are connected.

## Features

- **Graph Visualization**: Interactive force-directed graph showing notes as nodes and tag relationships as links
- **List View**: Traditional list view with note cards showing tags and connection counts
- **Search Functionality**: Search notes by title or tags
- **Tag Filtering**: Filter notes by selecting one or more tags
- **Dark Theme Support**: Automatically adapts to Standard Notes dark theme
- **Responsive Design**: Works well on different screen sizes
- **Interactive Tooltips**: Hover over nodes to see note details
- **Drag and Drop**: Drag nodes to rearrange the graph

## Installation

### From Standard Notes

1. Open Standard Notes
2. Go to **Extensions** > **Install Extension**
3. Enter the plugin URL: `https://tinux-67.github.io/Standard-Notes-Plugins/ext.json`
4. Click **Install**

### Manual Installation

1. Download the latest `latest.zip` from [GitHub Pages](https://tinux-67.github.io/Standard-Notes-Plugins/latest.zip)
2. In Standard Notes, go to **Extensions** > **Install Extension** > **From File**
3. Select the downloaded ZIP file

## Development

### Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run start
```

The demo page will be launched automatically at `http://localhost:8080/demo.html`

### Building

```bash
# Build for production
pnpm run build

# Preview the build
pnpm run preview
```

### Project Structure

- `src/components/TagVisualizer.tsx` - Main plugin component
- `src/index.tsx` - Entry point for the plugin
- `src/index.scss` - Styles for the plugin
- `src/demo/` - Demo page and mock data
- `public/ext.json` - Plugin metadata
- `public/local.json` - Local development plugin metadata

## How It Works

The plugin:

1. Fetches all notes from Standard Notes using the extension API
2. Extracts tags from each note
3. Creates connections between notes that share tags
4. Renders an interactive graph using D3.js
5. Allows filtering by search query and selected tags

### Graph Visualization

- **Nodes**: Represent notes, colored based on the number of tags
- **Links**: Represent shared tags between notes, with thickness indicating the number of shared tags
- **Interactions**: Drag nodes, hover for details, click tags to filter

### List View

- Shows notes as cards with their tags
- Displays connection count for each note
- Click on tags to filter

## Customization

You can customize the plugin by modifying the following files:

- `public/ext.json` - Update plugin name, description, and URLs
- `src/components/TagVisualizer.tsx` - Modify the visualization logic
- `src/index.scss` - Change the styling

## Deployment

This plugin is automatically deployed to GitHub Pages using GitHub Actions. The workflow:

1. Push changes to the `main` branch
2. GitHub Actions builds the plugin
3. Built files are deployed to the `gh-pages` branch
4. GitHub Pages serves the plugin from `https://tinux-67.github.io/Standard-Notes-Plugins/`

### Setting Up GitHub Pages

1. Create a `gh-pages` branch in your repository
2. Enable GitHub Pages in repository settings:
   - Go to **Settings** > **Pages**
   - Select **Deploy from a branch**
   - Choose **gh-pages** branch and **/ (root)** folder
3. The workflow will automatically deploy on each push to `main`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

- Built with [Standard Notes Extension API](https://github.com/standardnotes/sn-extension-api)
- Uses [D3.js](https://d3js.org/) for graph visualization
- Uses [Preact](https://preactjs.com/) for React compatibility

## Support

For issues or feature requests, please open an issue on the [GitHub repository](https://github.com/Tinux-67/Standard-Notes-Plugins).
