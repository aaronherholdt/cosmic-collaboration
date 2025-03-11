# Hexagonal Harvest - Galactic Map

A web-based space strategy game that renders a procedurally generated galaxy with star systems arranged in spiral arms, using HTML5 Canvas and JavaScript.

## Features

- Procedurally generated galaxy with spiral arms containing star systems
- Each star system is represented by a hexagonal grid inside a circular boundary
- Different star types with unique color palettes (blue, yellow, red, white, orange, purple, and green stars)
- Interactive selection and hover effects for star systems
- Dynamic information panel showing details about the selected star system
- Mini-map for navigation across the vast galaxy
- Compass rose for orientation
- Seamless panning navigation to explore the galaxy

## Star Types

The galaxy contains various types of star systems:
1. **Galactic Core** - The central supermassive star at the center of the galaxy
2. **Blue Giants** - Hot, massive stars with blue coloration
3. **Yellow Dwarfs** - Sun-like stars with moderate temperatures
4. **Red Dwarfs** - Smaller, cooler stars with reddish hues
5. **White Dwarfs** - Dense stellar remnants with white coloration
6. **Orange Giants** - Large stars with orange coloration
7. **Blue-Purple Variables** - Unusual stars with blue to purple coloration
8. **Exotic Green** - Rare stars with unusual green coloration

## How to Play

1. Clone or download this repository
2. Open `index.html` in your web browser
3. Click and drag to pan around the galaxy
4. Click on any star system to select it and view its information
5. Hover over star systems to see their names
6. Use the mini-map to navigate the galaxy structure
7. Click the "Generate New Galaxy" button to create a new procedurally generated galaxy

## Technical Details

The application uses:
- HTML5 Canvas for rendering the galaxy map
- JavaScript for procedural generation of the galaxy
- Spiral arm algorithm for realistic galaxy structure
- Axial coordinate system for efficient hexagonal grid layout
- Viewport culling for efficient rendering
- Camera panning for navigation

## Implementation Details

- The galaxy is generated with a central core and spiral arms
- Star systems are placed along the spiral arms with some randomness
- Each star system has a unique name, type, and resources
- Only hexagons visible in the current viewport are rendered for performance
- The mini-map provides a zoomed-out view of the entire galaxy structure

## Future Development

This is the foundation for a space strategy game. Future enhancements could include:
- Zoom functionality to view star systems at different scales
- Fleet management for space travel between star systems
- Resource gathering and management
- Colony development on planets within star systems
- Diplomacy with alien civilizations
- Research and technology tree
- Combat system for space battles
- Save/load game functionality

## License

This project is open source and available for personal and educational use. 