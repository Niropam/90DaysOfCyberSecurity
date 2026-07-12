# Omni Calculator App

A single-file web app (`index.html`) — no build step, no dependencies. Just open it in any modern browser.

## Features

### 🧮 Standard calculator
- Basic arithmetic (`+ − × ÷`), parentheses, percent (`%`), power (`xʸ`), square root (`√`)
- Live result preview while typing
- Full keyboard support: digits, operators, `Enter` (=), `Backspace` (delete), `Esc` (clear)

### 📅 Date & time calculator
- **Difference between two dates/times** — years, months, days, hours, minutes, plus totals in days/hours/minutes/weeks
- **Add or subtract** years / months / days / hours / minutes from any date
- **Age calculator** — exact age, total days lived, and days until next birthday

### 🔁 Converters (multiple unit systems: metric, US and imperial)
| Converter | Units |
|---|---|
| 📏 Length | mm, cm, m, km, µm, inch, foot, yard, mile, nautical mile, light year |
| ⚖️ Weight | mg, g, kg, tonne, ounce, pound, stone, US ton, imperial ton, carat |
| 🚀 Speed | m/s, km/h, mph, ft/s, knot, Mach, speed of light |
| 🧪 Volume | mL, L, m³, cm³, in³, ft³, US tsp/tbsp/fl oz/cup/pint/quart/gallon, imperial fl oz/pint/quart/gallon |
| 🌡️ Temperature | Celsius, Fahrenheit, Kelvin, Rankine |
| 💱 Currency | 35+ currencies — live rates from open.er-api.com when online, built-in reference rates offline |

Every converter has a value box, from/to unit pickers, a ⇄ swap button, and updates as you type.

### 🕐 Live header widgets
- **Current time** — live clock with your timezone
- **Today's date** — with weekday
- **Temperature** — your local temperature via Open-Meteo (asks for location permission; no API key needed), switchable between °C and °F
- 🌓 Light/dark theme toggle

## Usage

```
open calculator-app/index.html      # or double-click the file
```

Works fully offline; only the live currency rates and the local temperature widget need an internet connection (both degrade gracefully when offline).
