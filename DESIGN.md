---
# Linda Messenger Design System
# Generated for Stitch / Design.md Compatibility

colors:
  primary:
    value: "#2c6bed"
    description: "Signal Blue - The core brand color used for primary actions and 'Me' chat bubbles."
  primary-content:
    value: "#ffffff"
    description: "Text color for use on primary backgrounds."
  
  base:
    100: "#000000" # OLED Black
    200: "#121214" # Deep Charcoal
    300: "#1b1b1f" # Dark Gray
    content: "#f5f5f5"
  
  secondary:
    value: "#2c2c2e"
    content: "#ffffff"
  
  accent:
    value: "#2c6bed"
  
  neutral:
    value: "#1b1b1f"
    content: "#f5f5f5"
  
  status:
    success: "#1fb377"
    warning: "#f1c40f"
    error: "#ff453a"
    info: "#2c6bed"

typography:
  family:
    main: "'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif"
    narrow: "'Inter Tight', sans-serif"
  size:
    xs: "9px"     # Metadata, uppercase tracking
    sm: "10px"    # Status labels
    base: "14px"  # Chat bubbles
    md: "15px"    # Headers
    lg: "18px"    # Section titles
    xl: "20px"    # Loading states
    "2xl": "24px" # Branding
  weight:
    normal: 400
    medium: 500
    semibold: 600
    bold: 700
    black: 900
  letter-spacing:
    tight: "-0.01em"
    tighter: "-0.02em"
    widest: "0.1em"

spacing:
  container-padding: "1.5rem" # 24px
  header-height: "4rem"      # 64px
  bubble-gap: "2rem"         # 32px
  avatar-size: "3rem"        # 48px

radii:
  selector: "1.25rem"
  field: "1.5rem"
  box: "1.25rem"
  bubble: "1rem"
  avatar: "9999px"

motion:
  duration:
    fast: "0.25s"
    standard: "0.3s"
    slow: "0.6s"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
    emphasized: "cubic-bezier(0.32, 0.72, 0, 1)"
    pop: "cubic-bezier(0.175, 0.885, 0.32, 1.275)"

elevation:
  glass:
    background: "rgba(255, 255, 255, 0.03)"
    blur: "12px"
    border: "1px solid rgba(255, 255, 255, 0.08)"
  shadow:
    inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)"
    glow: "0 0 20px rgba(44, 107, 237, 0.15)"
---

# Linda Messenger Design System

Linda is a premium, secure messenger that prioritizes **minimalism, technical precision, and visual depth**. The design draws inspiration from modern privacy-focused applications while adding a "Pro" layer through high-contrast OLED blacks and subtle glassmorphism.

## Visual Identity

### The "OLED Black" Aesthetic
The interface is anchored by an absolute black (`#000000`) background. This provides maximum contrast for the **Signal Blue** (`#2c6bed`) accents and creates a "boundless" feel on modern displays. Deep charcoal surfaces (`#121214`) are used to create layers of depth without breaking the dark-mode immersion.

### Precision Typography
We use **Inter Tight** as the primary typeface. Its slightly narrower proportions give the app a "technical" and "compressed" feel, allowing for more information density while maintaining readability. Tight letter-spacing (`-0.01em` to `-0.02em`) is used consistently to reinforce this premium, engineered look.

### Chat Architecture
- **Message Bubbles**: Bubbles use generous corner radii (`1rem`) but feature a "sharp" corner (top-right for 'Me', top-left for 'Them') to indicate directionality. 
- **Staggered Motion**: Messages don't just appear; they "pop" into existence with a slight scale and upward translation, giving the conversation a rhythmic, tactile feel.
- **Glassmorphism**: Overlays, modals, and search bars use heavy backdrop blurs (`12px`) and low-opacity backgrounds to maintain context while focusing the user's attention.

## Design Intent

### Privacy First
The UI uses metaphors of **locking and shielding**. Success states are subtle green, but security-critical information (like encrypted status or certificate regeneration) uses "Signal Blue" to denote the "Safe Zone."

### Responsiveness & Density
The layout is designed for high-density information. Sidebar items are tight, headers are minimalist, and metadata (like timestamps) are kept small (`9px`) and uppercase to stay out of the way of the core content.

### Tactile Feedback
Every interaction—from clicking a message to selecting a tag—is accompanied by a smooth transition. The `cubic-bezier(0.2, 0, 0, 1)` easing is the standard for the app, providing a "snappy yet fluid" experience.
