# OrbitOffice Website Design

## Overview
This document describes the design of the static website for OrbitOffice, located at `docs/index.html` with accompanying styles in `docs/style.css`. The site is intended to be served via GitHub Pages at https://jting904.github.io/OrbitOffice/.

## Visual Design
- **Theme**: Dark space theme with near-black navy background (`#0a0f1c`), cyan (`#22d3ee`) to violet (`#8b5cf6`) gradient accents, and subtle starfield animation.
- **Typography**: Inter font from Google Fonts for a modern, clean look.
- **Color Scheme**:
  - Background: `#0a0f1c`
  - Foreground text: `#e0e7ff`
  - Muted text: `#94a3b8`
  - Accent gradient: `linear-gradient(135deg, #22d3ee, #8b5cf6)`
  - Card background: `rgba(15, 23, 42, 0.6)`
  - Card border: `rgba(34, 211, 238, 0.15)`

## Layout and Sections
The page is divided into the following sections:

1. **Hero**
   - Centered logo (`img/icon.svg`)
   - Headline: "Build your AI office"
   - One-sentence description
   - Primary button: "Download for Windows" (links to GitHub releases)
   - Secondary button: "View on GitHub" (links to repository)
   - Below the buttons: large screenshot of the 3D world (`img/world.jpg`) showing full content width, rounded corners, and a soft cyan glow

2. **How it works**
   - Three-step process illustrated with corrected screenshots:
     1. Describe your team (`img/build-with-ai.jpg`)
     2. AI builds the office (`img/marketing-office.jpg`)
     3. The team does real work (`img/team-at-work.jpg`)
   - Each step features an image (taller with 16/10 aspect ratio, object-fit: cover), heading, and description with inner padding (~20px) so text doesn't touch card edges.
   - Step 2 description corrected to: "The AI builds the teams and agents, each with a role and instructions. Or start from a ready-made template and edit any agent as a .md file."

3. **Features**
   - Grid of feature cards (responsive, 1 column on narrow screens, multiple columns on wider screens):
     - Departments in one world
     - Real files and handoffs
     - Shared brain with skills and connectors
     - Your own AI keys or built‑in local AI
     - Permission modes
     - Security team: an attacker tests your project for vulnerabilities (only targets you allow) and a security engineer fixes them.
   - Each card features a heading, a short paragraph, and a colored dot (using the gradient) as a visual marker.
   - Grid now shows 6 cards in 3 columns (collapsing to 1 column on phones) so no card is left alone on a row.

4. **FAQ**
   - Accordion-style details/summary elements for:
     - Is OrbitOffice free?
     - Which AI models can I use?
     - Is my data safe? (corrected answer: "Your files stay on your computer. When you use a cloud AI, what the agents read and write is sent to that AI provider; with the built-in local AI nothing leaves your computer. API keys are stored encrypted on your PC and only sent to their own provider. OrbitOffice has no telemetry.")
     - Windows SmartScreen warning – what should I do?
   - Styled with dark card background and gradient accent on the summary marker.

5. **Footer**
   - Copyright with current year (set via JavaScript)
   - MIT License link
   - Links to GitHub (JTing904) and Instagram (@jtinnnng)

## Components
- **Buttons**: Two styles — primary (gradient background) and secondary (dark card background with border).
- **Cards**: Used in features section and FAQ; dark background with subtle border and hover effects (lift and shadow).
- **Steps**: Each step in "How it works" is a card with an image at the top and content below.
- **Accordion**: Native HTML `<details>`/`<summary>` for FAQ, styled to match the theme.
- **Logo**: SVG logo from `img/icon.svg`, displayed in the hero and favicon.

## Responsiveness
- The layout uses a fluid container (90% width, max-width 1200px) and responsive grids:
  - Hero buttons stack vertically on screens ≤480px.
  - Steps grid changes from multiple columns to single column on narrow screens.
  - Features grid adapts from multiple columns to single column.
  - Typography scales down on smaller screens.
- All images are set to `max-width: 100%` and `height: auto` where appropriate, with object-fit for step images.

## States and Interactions
- **Hover effects**: Buttons lift and increase shadow; cards lift and change border color; steps lift on hover.
- **Focus**: Buttons and interactive elements have clear focus outlines (relying on browser defaults, but colors are visible against dark background).
- **Accordion**: Expands/collapses with a rotating arrow indicator.
- **JavaScript**: Only a small script to update the year in the footer; no external libraries.

## User Flows
1. **Landing**: User arrives at the site, sees the hero with logo, headline, and call-to-action.
2. **Learn**: User scrolls to "How it works" to understand the three-step process.
3. **Explore Features**: User examines the feature grid to learn about capabilities.
4. **Get Answers**: User checks the FAQ for common questions.
5. **Download or Explore Source**: User clicks either the "Download for Windows" button (to get the installer) or the "View on GitHub" button (to see the source code).
6. **Footer Links**: User can visit the GitHub or Instagram profiles.

## Assets Used
- Logo: `docs/img/icon.svg` (also used as favicon)
- Screenshots:
  - `docs/img/world.jpg` (used in Open Graph image, not directly on page but could be used in hero background if desired; currently not placed on page per spec)
  - `docs/img/build-with-ai.jpg` (step 2)
  - `docs/img/marketing-office.jpg` (step 3)
  - `docs/img/team-at-work.jpg` (step 1)
- No other external assets; Google Fonts are loaded via CSS.

## File to Open
To view the website, open `docs/index.html` in a web browser.
