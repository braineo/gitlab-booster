// ==UserScript==
// @name         gitlab booster
// @namespace    http://tampermonkey.net/
// @version      2024-08-15
// @description  Boost productivity for code reviewers on gitlab
// @author       braineo
// @match        https://gitlab.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gitlab.com
// @require      https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        none
// ==/UserScript==

/* global $ */

(function () {
  'use strict';
  // copy from this extension
  // https://github.com/Krystofee/gitlab-unresolved-threads/blob/master/enhance-merge-requests.js
  async function fetchGitLabData(url) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      console.error('Failed to fetch GitLab data:', response.statusText);
      return null;
    }
    return await response.json();
  }

  //
  // Element manipulation
  //

  function createThreadsBadge(element, badgeClassName, resolved, resolvable) {
    const li = $('<li/>')
      .addClass('issuable-comments d-none d-sm-flex')
      .prependTo(element);

    $('<span/>')
      .addClass(
        `gl-badge badge badge-pill badge-${badgeClassName} sm has-tooltip`,
      )
      .text(`${resolved}/${resolvable} threads resolved`)
      .prependTo(li);
  }

  function createDiffStat(element, fileCount, addLineCount, deleteLinCount) {
    const diffContent = $('<div/>')
      .css({ display: 'flex', 'flex-direction': 'row', gap: '3px' })
      .append(
        $('<div/>', { class: 'diff-stats-group' }).append(
          $('<span/>', {
            class: 'gl-text-gray-500 bold',
            text: `${fileCount} files`,
          }),
        ),

        $('<div/>', {
          class:
            'diff-stats-group gl-text-green-600 gl-display-flex gl-align-items-center bold',
        }).append($('<span/>').text('+'), $('<span/>').text(`${addLineCount}`)),

        $('<div/>', {
          class:
            'diff-stats-group gl-text-red-500 gl-display-flex gl-align-items-center bold',
        }).append(
          $('<span/>').text('−'),
          $('<span/>').text(`${deleteLinCount}`),
        ),
      )
      .prependTo(element);
  }

  //
  // Data process
  //

  async function addMergeRequestThreadMeta(element, mergeRequestUrl) {
    // Fetch unresolved threads from GitLab API
    const discussions = await fetchGitLabData(
      `${mergeRequestUrl}/discussions.json`,
    );
    let resolvable = 0;
    let resolved = 0;

    for (const discussion of discussions) {
      if (discussion.resolvable) {
        resolvable += 1;
      }
      if (discussion.resolved) {
        resolved += 1;
      }
    }

    if (resolvable > resolved) {
      createThreadsBadge(element, 'danger', resolved, resolvable);
    } else if (resolved === resolvable && resolvable > 0) {
      createThreadsBadge(element, 'success', resolved, resolvable);
    }
  }

  async function addMergeRequestDiffMeta(element, mergeRequestUrl) {
    const diffsMeta = await fetchGitLabData(
      `${mergeRequestUrl}/diffs_metadata.json`,
    );

    createDiffStat(
      element,
      diffsMeta.diff_files.length,
      diffsMeta.added_lines,
      diffsMeta.removed_lines,
    );
  }

  //
  // Page process
  //

  // Function to enhance the merge request list with unresolved threads
  async function enhanceMergeRequestList() {
    const mergeRequests = document.querySelectorAll('.merge-request'); // Change this selector according to GitLab's MR structure

    for (let mergeRequest of mergeRequests) {
      const mergeRequestUrl = mergeRequest.querySelector(
        '.merge-request-title-text a',
      ).href;

      const metaList = $(mergeRequest).find(
        '.issuable-meta ul, ul.controls',
      )[0];

      await addMergeRequestThreadMeta(metaList, mergeRequestUrl);
      await addMergeRequestDiffMeta(metaList, mergeRequestUrl);
    }
  }

  // Function to enhance the issue detail page with related project names of merge requests
  async function enhanceIssueDetailPage() {
    const title = $('#related-merge-requests')[0];
    if (!title) {
      // no related merge requests
      return;
    }

    // select related items and exclude related issue
    // need to wait for the list to show up as the issue page loads first then loads the related merge request asynchronously
    waitForKeyElements(
      '.issue-details.issuable-details.js-issue-details div.js-issue-widgets .related-items-list li:not(.js-related-issues-token-list-item)',
      function (mergeRequest) {
        (async function () {
          console.debug(
            'inserting merge request meta to related merge requests',
            mergeRequest,
          );

          const mergeRequestUrl = mergeRequest.find('.item-title a')[0].href;

          const diffsMeta = await fetchGitLabData(
            `${mergeRequestUrl}/diffs_metadata.json`,
          );

          const metaDiv = mergeRequest.find(
            '.item-meta .item-attributes-area',
          )[0];

          await addMergeRequestThreadMeta(metaDiv, mergeRequestUrl);

          await addMergeRequestDiffMeta(metaDiv, mergeRequestUrl);

          $('<span/>').text(diffsMeta.project_path).prependTo(metaDiv);
        })();
      },
      true,
    );
  }

  //
  // Entry point
  //

  const issueDetailRegex = /\/issues\/\d+/;

  const mergeRequestListRegex = /\/merge_requests(?!\/\d+)/;

  // Run the script when the DOM is fully loaded
  window.onload = function () {
    if (mergeRequestListRegex.test(window.location.href)) {
      enhanceMergeRequestList();
    }

    if (issueDetailRegex.test(window.location.href)) {
      enhanceIssueDetailPage();
    }
  };
})();