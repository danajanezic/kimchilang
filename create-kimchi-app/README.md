# create-kimchi-app

Bootstrap a new KimchiLang application with a single command.

## Usage

```bash
npx create-kimchi-app my-app
cd my-app
kimchi src.main
```

## What's Included

The generated project includes:

- `project.static` - Project configuration
- `src/main.km` - Main entry point
- `lib/utils.km` - Example utility module
- `tests/utils.test.km` - Example tests
- `.gitignore` - Git ignore file
- `README.md` - Project documentation

## Project Structure

```
my-app/
├── project.static
├── README.md
├── .gitignore
├── src/
│   └── main.km
├── lib/
│   └── utils.km
└── tests/
    └── utils.test.km
```

## Options

```bash
npx create-kimchi-app --help     # Show help
npx create-kimchi-app --version  # Show version
```
