#!/usr/bin/env python3
"""
Simple script to generate placeholder icons for the SEO & AEO Auditor extension.
Requires Pillow: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Error: Pillow not installed. Install it with: pip install Pillow")
    exit(1)

def create_icon(size, filename):
    """Creates a simple icon with SEO/AEO text."""
    # Create image with blue gradient background
    img = Image.new('RGB', (size, size), color=(0, 123, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw a simple circle/gear-like icon
    margin = size // 4
    center = size // 2
    radius = center - margin
    
    # Draw outer circle
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        outline=(255, 255, 255),
        width=max(2, size // 32)
    )
    
    # Draw text "SEO" for larger icons
    if size >= 48:
        try:
            # Try to use a system font
            font_size = size // 3
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except:
                font = ImageFont.load_default()
        
        text = "SEO" if size >= 64 else "S"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        text_x = (size - text_width) // 2
        text_y = (size - text_height) // 2
        draw.text((text_x, text_y), text, fill=(255, 255, 255), font=font)
    
    # Draw small search/audit icon lines for smaller sizes
    if size < 48:
        line_length = size // 3
        line_width = max(1, size // 16)
        # Draw a simple magnifying glass shape
        draw.arc(
            [center - line_length, center - line_length, center + line_length, center + line_length],
            start=45,
            end=315,
            fill=(255, 255, 255),
            width=line_width
        )
    
    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

if __name__ == "__main__":
    sizes = [16, 48, 128]
    for size in sizes:
        create_icon(size, f"icon{size}.png")
    print("\nIcons generated successfully!")

