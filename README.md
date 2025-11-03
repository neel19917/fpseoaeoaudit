# SEO & AEO Auditor (Claude AI)

A powerful Chrome extension for comprehensive SEO and Answer Engine Optimization (AEO) audits powered by Claude AI.

## Features

### 🚀 Core Features
- **One-Click SEO Audits**: Analyze any webpage instantly
- **AI-Powered Analysis**: Uses latest Claude models for intelligent recommendations
- **AEO Optimization**: Optimized for AI search engines and answer engines
- **Verbose Logging**: Detailed debugging and analysis logs
- **Persistent Storage**: Results saved locally for 7 days
- **Enhanced Downloads**: Full reports with metadata

### 🤖 Claude AI Models Supported
- Claude Sonnet 4.5 (Latest - Recommended)
- Claude Opus 4.1 (Most capable)
- Claude Haiku 4.5 (Fastest, cheapest)
- Previous generation models (Claude 3.x)

### 📊 Audit Coverage
- Title and meta description analysis
- Heading structure (H1-H6)
- Internal and external link analysis
- Image optimization and alt text
- Structured data (Schema.org)
- Open Graph and Twitter Cards
- Content quality metrics
- EEAT (Expertise, Authority, Trust) signals
- Featured snippet readiness
- Mobile-friendliness indicators

### 🔧 Advanced Features
- **Verbose Logging**: Toggle detailed logs in settings
- **In-App Log Viewer**: View audit process step-by-step
- **Downloadable Reports**: Markdown reports with full metadata
- **Linkable Results**: Share and reference audit results
- **Copy with Metadata**: Copy results with URL and timestamp

## Installation

### From Source

1. Clone this repository:
```bash
git clone https://github.com/neel19917/fpseoaeoaudit.git
cd fpseoaeoaudit
```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension folder

3. Get your Anthropic API key:
   - Visit [Anthropic Console](https://console.anthropic.com/)
   - Create an account or sign in
   - Generate an API key
   - Copy your API key (starts with `sk-ant-`)

4. Configure the extension:
   - Click the extension icon
   - Click the settings (⚙️) button
   - Paste your API key
   - Select your preferred model
   - Click "Save Settings"
   - Click "Test API Key" to verify

## Usage

### Basic Audit

1. Navigate to any webpage you want to audit
2. Click the extension icon
3. Click "Run Audit"
4. Wait for Claude AI to analyze the page
5. Review the comprehensive SEO/AEO report

### With Verbose Logging

1. Open settings and enable "Verbose Logging"
2. Run an audit
3. Click the 📝 logs button to view detailed process logs
4. Check browser console (F12) for technical details

### Download Reports

1. After running an audit
2. Click the 💾 download button
3. Get a comprehensive Markdown report with:
   - Full analysis
   - Page metadata
   - Audit statistics
   - Timestamp and model used

## Configuration

### Settings

- **API Key**: Your Anthropic API key (required)
- **Model**: Choose your preferred Claude model
- **Verbose Logging**: Enable detailed console logs

### Storage

- **Last Audit**: Saved for 7 days in local storage
- **Settings**: Synced across devices via Chrome Sync Storage
- **Audit History**: Last 5 audits tracked locally

## Privacy & Security

- ✅ API key stored locally in your browser
- ✅ Keys never transmitted except to Anthropic API
- ✅ Audit results stored locally in browser storage
- ✅ Results never leave your device
- ✅ No data collected by extension
- ✅ All processing happens client-side
- ✅ Audit data automatically expires after 7 days

## Development

### Project Structure

```
SEO:AEO Agent/
├── manifest.json           # Extension manifest
├── background.js          # Service worker
├── popup.html            # Main popup UI
├── popup.js              # Popup logic
├── options.html          # Settings page
├── options.js            # Settings logic
├── contentScript.js      # Page signal collector
├── styles.css            # Styles
├── icons/                # Extension icons
├── FEATURES.md           # Feature documentation
└── STORAGE_FEATURE.md    # Storage implementation docs
```

### Key Technologies

- Chrome Extension Manifest V3
- Anthropic Claude API
- Chrome Storage API (Local & Sync)
- Vanilla JavaScript (no frameworks)

### Building & Testing

No build step required - pure JavaScript.

To test:
1. Make your changes
2. Go to `chrome://extensions/`
3. Click reload icon on the extension
4. Test your changes

## Troubleshooting

### Common Issues

**401 Unauthorized Error**
- Check your API key in settings
- Verify it starts with `sk-ant-`
- Get a fresh key from [Anthropic Console](https://console.anthropic.com/)

**No Signals Collected**
- Can't audit `chrome://` pages
- Wait for page to fully load
- Check that JavaScript is enabled

**Extension Not Loading**
- Reload extension at `chrome://extensions/`
- Check browser console for errors
- Verify all files are present

**Results Not Persisting**
- Check browser storage isn't full
- Verify extension has storage permissions
- Results expire after 7 days

### Enable Verbose Logging

1. Go to extension settings
2. Check "Enable Verbose Logging"
3. Save settings
4. Run audit
5. Click 📝 to view logs
6. Check browser console (F12) for technical details

## API Costs

This extension uses the Anthropic Claude API, which is a paid service:

- Claude Sonnet 4.5: ~$3 per million input tokens
- Claude Opus 4.1: ~$15 per million input tokens  
- Claude Haiku 4.5: ~$0.80 per million input tokens

Typical audit costs:
- Average audit: $0.01 - $0.05 per audit
- Recommended: Use Sonnet 4.5 for best value

See [Anthropic Pricing](https://www.anthropic.com/pricing) for current rates.

## Roadmap

### Coming Soon
- ☐ Cloud sync with Supabase
- ☐ User authentication
- ☐ Audit history browser
- ☐ Shareable audit reports
- ☐ Team collaboration
- ☐ Batch audits
- ☐ Scheduled audits
- ☐ Comparison over time

### Future Features
- Competitive analysis
- Keyword tracking
- SERP analysis
- Backlink analysis
- Site-wide crawl

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/neel19917/fpseoaeoaudit/issues)
- **Documentation**: See `FEATURES.md` for detailed feature documentation
- **API Documentation**: [Anthropic Claude API Docs](https://docs.anthropic.com/)

## Acknowledgments

- Powered by [Anthropic Claude AI](https://www.anthropic.com/)
- Built with Chrome Extension Manifest V3
- Icons generated with custom tool (see `icons/` folder)

## Version History

### v1.1.0 (Current)
- Added Supabase cloud sync support (in progress)
- Updated to latest Claude models
- Enhanced manifest for cloud features

### v1.0.0
- Initial release
- Core SEO/AEO audit functionality
- Verbose logging
- Persistent local storage
- Enhanced download reports
- Latest Claude 4 models support

---

**Made with ❤️ for SEO professionals and developers**

For more information, visit the [GitHub repository](https://github.com/neel19917/fpseoaeoaudit).

