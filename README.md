# X23D website

This repository contains the public X23D website. It uses Jekyll and deploys to GitHub Pages through GitHub Actions.

## Local preview

1. Install Ruby and Bundler. Jekyll is pinned in `Gemfile` for consistent builds.
2. Run `bundle install`.
3. Run `bundle exec jekyll serve --livereload`.
4. Open `http://localhost:4000`.

## Common updates

- Main page copy: `index.html`
- Colors and layout: `assets/css/main.scss`
- Company URL and metadata: `_config.yml`
- Images and video: `assets/images` and `assets/video`
- Deployment: `.github/workflows/pages.yml`

## Before launch

- Confirm every public claim and partner reference.
- Confirm permission to publish each photograph and visualization.
- Update `url` in `_config.yml` if the final domain changes.
- In the GitHub repository settings, set Pages to use **GitHub Actions** as its source.
- Verify the custom domain and enable HTTPS.

The production page intentionally uses the supplied watermarked animation without further editing. Historical exports and source material remain in the ignored `background content` directory and are not published.
