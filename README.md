# GitLab booster

This add long missing features in the merge request list and issue detail.

## Usage



### Install from greasyfork.org

https://greasyfork.org/en/scripts/509169-gitlab-booster

### Copy and paste

This is a tampermonkey script, you can also copy and paste into your tampermonkey to enable it.


### Self-hosted GitLab instances

If you are using tampermonkey. In the settings of the installed script. Add your site in the `User matches`

Or add additional match rules in the user script header section.

```
// @match        https://mygitlab.com/*
// @match        https://yourgitlab.com/*
```

## Preview

![merge-request-list-after](https://github.com/user-attachments/assets/33d3442a-0a98-4d88-ba1e-30db98bcecce)

![issue-detail](https://github.com/user-attachments/assets/b3592273-98b2-4850-81a6-3b312a22c7c9)

## Credit

Thanks for the awesome work in this chrome extension https://github.com/Krystofee/gitlab-unresolved-threads, I adopted the unresolved threads to a user script and added other features.
