# GitLab booster

This add long missing features in the merge request list and issue detail.

## Usage

### Install from greasyfork.org

https://greasyfork.org/en/scripts/509169-gitlab-booster


### Self-hosted GitLab instances

This is configurable in tampermonkey.

1. Click tampermonkey icons in the extension bar and open dashboard
2. Select gitlab booster and open Settings tab
3. Find Includes/Excludes section and Add your site in `User matches` like `https://self-host.com/*`

## Preview

![merge-request-list-after](https://github.com/user-attachments/assets/33d3442a-0a98-4d88-ba1e-30db98bcecce)

![issue-detail](https://github.com/user-attachments/assets/b3592273-98b2-4850-81a6-3b312a22c7c9)

## Development

This project uses `bun` and `biome` for trying them out.

For local development, run

``` shell
bun install
bun run dev
```

run `bun run lint && bun run format` for linting and formatting

## Credit

Thanks for the awesome work in this chrome extension https://github.com/Krystofee/gitlab-unresolved-threads, I adopted the unresolved threads to a user script and added other features.
