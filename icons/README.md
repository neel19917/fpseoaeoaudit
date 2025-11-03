# Extension Icons

This directory should contain the following icon files:

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Generating Icons

### Option 1: HTML Generator (Recommended - No Dependencies)

Open `generate_icons.html` in your browser and click "Generate All Icons". The icons will be downloaded automatically.

### Option 2: Python Script

If you have Pillow installed:
```bash
pip install Pillow
python3 generate_icons.py
```

### Option 3: Manual Creation

Use any image editor or online tools:
- https://www.favicon-generator.org/
- https://realfavicongenerator.net/

## Note

The extension will work without icons (Chrome shows a default placeholder), but custom icons are recommended for a polished look.

