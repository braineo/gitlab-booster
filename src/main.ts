import { GM_addElement } from '$';
import $ from 'jquery';
import { waitForKeyElements } from './waitForKeyElements';

GM_addElement('link', {
  rel: 'stylesheet',
  href: 'https://cdn.jsdelivr.net/npm/nf-sauce-code-pro@2.1.3/nf-font.min.css',
});

//
// Types
//

interface DiffsMeta {
  project_path: string;
  diff_files: Array<{
    new_path: string;
    added_lines: number;
    removed_lines: number;
  }>;
}

interface DiscussionNote {
  type: null | 'LabelNote' | 'DiscussionNote';
  author: User;
}

interface MergeRequestDiscussion {
  resolved: boolean;
  resolvable: boolean;
  notes: DiscussionNote[];
}

interface Issue {
  iid: number;
  project_id: number;
}

interface MergeRequestListItem {
  iid: number;
  target_project_full_path: string;
}

interface MergeRequest {
  title: string;
  project_id: number;
  author: User;
  state: string;
  assignees: User[];
  reviewers: User[];
}

interface User {
  id: number;
  username: string;
  name: string;
}

//
// API
//

// although @gitbeaker/rest is convenient, but the bundle size is huge
const getApiUrl = (url: string): string => {
  return `${window.location.origin}/api/v4${url}`;
};

async function fetchGitLabData<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    console.error('Failed to fetch GitLab data:', response.statusText);
    return null;
  }
  return await response.json();
}

let currentUser: User | null;

//
// Element manipulation
//

function createThreadsBadge(
  element: HTMLElement,
  badgeClassName: string,
  resolved: number,
  resolvable: number,
) {
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

function createDiffStat(
  element: HTMLElement,
  fileCount: number,
  addLineCount: number,
  deleteLinCount: number,
) {
  $('<div/>')
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
      }).append($('<span/>').text('-'), $('<span/>').text(`${deleteLinCount}`)),
    )
    .prependTo(element);
}

function createIssueCardMergeRequestInfo(
  element: HTMLElement,
  opened: number,
  total: number,
) {
  const inline = $('<span/>').appendTo(element);

  $('<div/>', {
    class:
      'issue-milestone-details gl-flex gl-max-w-15 gl-gap-2 gl-mr-3 gl-inline-flex gl-max-w-15 gl-cursor-help gl-items-center gl-align-bottom gl-text-sm gl-text-gray-500',
  })
    .append(
      $('<span/>', {
        title: 'Merge requests',
      })
        .css({
          'font-family': 'SauceCodePro Mono',
          'font-size': '1.1rem',
        })
        .text('\ue726'),

      $('<span/>', {
        class: 'gl-inline-block gl-truncate gl-font-bold',
      }).text(total === 0 ? '-/-' : `${total - opened}/${total}`),
    )
    .appendTo(inline);
}

function ensurePanelLayout() {
  // ensure two column scroll structure
  const layout = document.querySelector('div.layout-page');
  if (!layout) {
    return;
  }
  $(layout).css({ display: 'flex', height: '100vh', overflow: 'hidden' });

  const content = document.querySelector('div.content-wrapper');
  if (!content) {
    return;
  }
  $(content).css({ overflowY: 'scroll' });
}

function ensureSidePanel(panelName: string, url: string) {
  const buttonId = `close-${panelName.toLowerCase().replaceAll(' ', '-')}`;

  if (!document.querySelector(`#${buttonId}`)) {
    const topBar = document.querySelector('.top-bar-container');
    if (!topBar) {
      return;
    }
    $(topBar).append(
      $('<button/>', {
        id: buttonId,
        class:
          'btn btn-default btn-md gl-button btn-close js-note-target-close btn-comment btn-comment-and-close',
      }).append($('<span/>').text(`Close ${panelName}`)),
    );

    $(`#${buttonId}`).on('click', () => {
      $('#issue-booster').remove();
      $(`#${buttonId}`).remove();
    });
  }

  const layout = document.querySelector('div.layout-page');
  if (!layout) {
    return;
  }
  $('#issue-booster').remove();
  // this is the only easy way to bypass CSP. But the tampermonkey can only addElement
  GM_addElement(layout, 'iframe', {
    id: 'issue-booster',
    src: url,
    // @ts-ignore // typing says style is readonly
    style:
      // make issue panel sticky
      'width: 100%; height: 100vh; position: sticky; align-self: flex-start; top: 0; flex: 0 0 40%;',
  });
}

const openModal = (url: string) => {
  const modal = $('#gitlab-booster-modal');

  if (modal) {
    modal.remove();
  }

  const modalContent = $('<div/>', { class: 'modal-content' }).append(
    $('<header/>', { class: 'modal-header' }).append(
      $('<h2/>', { textContent: 'Quick preview' }),
      $('<button/>', {
        class:
          'btn btn-default btn-md gl-button btn-close js-note-target-close btn-comment btn-comment-and-close',
      })
        .append($('<span/>').text('Close Modal'))
        .on('click', () => {
          document.querySelector('#gitlab-booster-modal')?.remove();
        }),
    ),
  );

  $('<div/>', {
    id: 'gitlab-booster-modal',
    class: 'modal fade show d-block gl-modal',
  })
    .append(
      $('<div/>', { class: 'modal-dialog modal-lg' }).append(modalContent),
    )
    .appendTo($('body'));

  const iframe = GM_addElement(modalContent[0], 'iframe', {
    id: 'issue-booster',
    src: url,
  });

  iframe.className = 'modal-body';
  iframe.setAttribute('style', 'height: 80vh;');
};

//
// Data process
//

const getUser = async () => {
  return fetchGitLabData<User>(getApiUrl('/user'));
};

async function addMergeRequestThreadMeta(
  element: HTMLElement,
  mergeRequestUrl: string,
) {
  // Fetch unresolved threads from GitLab API
  const discussions =
    (await fetchGitLabData<MergeRequestDiscussion[]>(
      `${mergeRequestUrl}/discussions.json`,
    )) ?? [];

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

  const listItem = await fetchGitLabData<MergeRequestListItem>(
    `${mergeRequestUrl}.json`,
  );

  if (!currentUser) {
    currentUser = await getUser();
  }

  const userId = currentUser?.id;

  if (listItem && userId) {
    const mergeRequest = await fetchGitLabData<MergeRequest>(
      getApiUrl(
        `/projects/${encodeURIComponent(listItem.target_project_full_path)}/merge_requests/${listItem.iid}`,
      ),
    );

    if (mergeRequest) {
      const isUserAuthor = mergeRequest.author.id === userId;
      const isUserReviewer =
        mergeRequest.assignees.some(user => user.id === userId) ||
        mergeRequest.reviewers.some(user => user.id === userId);

      if (isUserAuthor) {
        // wait for others' response
        let needOtherReplyThread = 0;
        // need for my response
        let needUserReplyThread = 0;
        for (const discusstion of discussions) {
          if (
            discusstion.resolvable &&
            !discusstion.resolved &&
            discusstion.notes.length > 0
          ) {
            if (discusstion.notes.at(-1)!.author.id === userId) {
              needOtherReplyThread += 1;
            } else {
              needUserReplyThread += 1;
            }
          }
        }

        console.log(
          mergeRequest.title,
          needOtherReplyThread,
          needUserReplyThread,
        );
      } else if (isUserReviewer) {
        // thread wait for others' response
        let needOtherReplyThread = 0;
        // thread need my response
        let needUserReplyThread = 0;
        // thread started by someone else
        let otherUnresolvedThread = 0;
        let needUserReview = true;

        for (const discusstion of discussions) {
          if (
            discusstion.resolvable &&
            !discusstion.resolved &&
            discusstion.notes.length > 0
          ) {
            if (discusstion.notes.at(0)!.author.id === userId) {
              needUserReview = false;
              if (discusstion.notes.at(-1)!.author.id === userId) {
                needOtherReplyThread += 1;
              } else {
                needUserReplyThread += 1;
              }
            }
          }
          otherUnresolvedThread =
            resolvable - resolved - needOtherReplyThread - needUserReplyThread;
        }

        // need my reviewed. any comment, upvote or approval
        // wait for others' response to my thread
        // wait for others' response to other thread
        // need for my response
        console.log(
          mergeRequest.title,
          needOtherReplyThread,
          needUserReplyThread,
          otherUnresolvedThread,
          needUserReview,
        );
      }
    }
  }
}

async function addMergeRequestDiffMeta(
  element: HTMLElement,
  mergeRequestUrl: string,
) {
  const diffsMeta = await fetchGitLabData<DiffsMeta>(
    `${mergeRequestUrl}/diffs_metadata.json`,
  );

  if (!diffsMeta) {
    return;
  }

  const { addedLineCount, deleteLinCount, fileCount } =
    dehydrateDiff(diffsMeta);

  createDiffStat(element, fileCount, addedLineCount, deleteLinCount);
}

function dehydrateDiff(diffsMeta: DiffsMeta) {
  const excludeRegexps = [
    /\.po$/, // translation files
    /mocks/, // mocks
    /(spec|test)\.\w+$/, // tests
    /package-lock.json/, // auto generated files
  ];

  let addedLineCount = 0;
  let deleteLinCount = 0;
  let fileCount = 0;

  file_loop: for (const file of diffsMeta.diff_files) {
    for (const excludeRegexp of excludeRegexps) {
      if (excludeRegexp.test(file.new_path)) {
        continue file_loop;
      }
    }
    addedLineCount += file.added_lines;
    deleteLinCount += file.removed_lines;
    fileCount += 1;
  }

  return {
    addedLineCount,
    deleteLinCount,
    fileCount,
  };
}

//
// Page process
//

// Function to enhance the merge request list with unresolved threads
async function enhanceMergeRequestList() {
  const mergeRequests = document.querySelectorAll('.merge-request');

  ensurePanelLayout();

  for (const mergeRequest of mergeRequests) {
    const mergeRequestUrl = mergeRequest.querySelector<HTMLAnchorElement>(
      '.merge-request-title-text a',
    )?.href;

    if (!mergeRequestUrl) {
      continue;
    }

    const metaList = $(mergeRequest).find('.issuable-meta ul, ul.controls')[0];

    addMergeRequestThreadMeta(metaList, mergeRequestUrl);
    addMergeRequestDiffMeta(metaList, mergeRequestUrl);

    $(mergeRequest).on('click', () => {
      ensureSidePanel('MR Panel', mergeRequestUrl);
    });
  }
}

// Function to enhance the issue detail page with related project names of merge requests
async function enhanceIssueDetailPage() {
  const title = $('#related-merge-requests')[0];
  if (!title) {
    // no related merge requests
    return;
  }

  ensurePanelLayout();

  // select related items and exclude related issue
  // need to wait for the list to show up as the issue page loads first then loads the related merge request asynchronously
  waitForKeyElements(
    '.issue-details.issuable-details.js-issue-details div.js-issue-widgets .related-items-list li:not(.js-related-issues-token-list-item)',
    (mergeRequest: Element) => {
      (async () => {
        console.debug(
          'inserting merge request meta to related merge requests',
          mergeRequest,
        );

        const statusSvg = mergeRequest.querySelector('.item-title svg');
        if (!statusSvg) {
          return;
        }
        const mergeRequestStatus = statusSvg.getAttribute('aria-label');

        const mergeRequestUrl =
          mergeRequest.querySelector<HTMLAnchorElement>('.item-title a')?.href;

        if (!mergeRequestUrl) {
          return;
        }

        $(mergeRequest).on('click', () => {
          ensureSidePanel('MR Panel', mergeRequestUrl);
        });

        switch (mergeRequestStatus) {
          case 'opened': {
            $(mergeRequest).css({ 'background-color': '#f9eeda' });
            break;
          }
          case 'merged': {
            break;
          }

          case 'closed': {
            $(mergeRequest).css({
              'background-color': '#c1c1c14d',
              filter: 'grayscale(1)',
              'text-decoration': 'line-through',
            });
            // no need to show the closed details
            return;
          }
        }

        const diffsMeta = await fetchGitLabData<DiffsMeta>(
          `${mergeRequestUrl}/diffs_metadata.json`,
        );

        if (!diffsMeta) {
          return;
        }

        const metaDiv = mergeRequest.querySelector<HTMLElement>(
          '.item-meta .item-attributes-area',
        );

        if (!metaDiv) {
          return;
        }

        if (mergeRequestStatus === 'opened') {
          await addMergeRequestThreadMeta(metaDiv, mergeRequestUrl);

          await addMergeRequestDiffMeta(metaDiv, mergeRequestUrl);
        }

        $('<span/>').text(diffsMeta.project_path).prependTo(metaDiv);
      })();
    },
    true,
  );
}

function enhanceIssueList() {
  ensurePanelLayout();

  waitForKeyElements('ul.issues-list > li', (issue: Element) => {
    const issueUrl = issue.querySelector<HTMLAnchorElement>('a')?.href;

    if (!issueUrl) {
      console.error('cannot find url for issue');
      return;
    }

    $(issue).on('click', () => {
      ensureSidePanel('Issue Panel', issueUrl);
    });
    // keep watching this DOM because gitlab reuse this list element
    return true;
  });
}

const enhanceIssueCard: MutationCallback = async (
  mutationList: MutationRecord[],
) => {
  for (const mutation of mutationList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && node.matches('li.board-card')) {
          const issueUrl = node.querySelector<HTMLAnchorElement>(
            'h4.board-card-title > a',
          )?.href;

          const infoItems = node.querySelector<HTMLElement>(
            'span.board-info-items',
          );

          if (!issueUrl || !infoItems) {
            continue;
          }

          const issue = await fetchGitLabData<Issue>(`${issueUrl}.json`);
          if (!issue) {
            continue;
          }

          const relatedMergeRequest =
            (await fetchGitLabData<MergeRequest[]>(
              getApiUrl(
                `/projects/${issue.project_id}/issues/${issue.iid}/related_merge_requests`,
              ),
            )) ?? [];

          const total = relatedMergeRequest.length;

          const opened = relatedMergeRequest.filter(
            mergeRequest => mergeRequest.state === 'opened',
          ).length;

          createIssueCardMergeRequestInfo(infoItems, opened, total);

          node.addEventListener('click', () => openModal(issueUrl));
        }
      }
    } else if (mutation.type === 'attributes') {
    }
  }
  return;
};

const observer = new MutationObserver(enhanceIssueCard);

const enhanceIssueBoard = () => {
  observer.disconnect();

  const boardElement = document.querySelector('.boards-list');
  if (!boardElement) {
    return;
  }

  observer.observe(boardElement, {
    attributes: false,
    childList: true,
    subtree: true,
  });
};

//
// Entry point
//

const issueDetailRegex = /\/issues\/\d+/;

const mergeRequestListRegex = /\/merge_requests(?!\/\d+)/;

const issueListRegex = /\/issues(?!\/\d+)/;

const epicListRegex = /\/epics(?!\/\d+)/;

const issueBoardRegex = /\/boards\/\d+/;

const enhance = () => {
  if (mergeRequestListRegex.test(window.location.href)) {
    enhanceMergeRequestList();
  }

  if (issueDetailRegex.test(window.location.href)) {
    enhanceIssueDetailPage();
  }

  if (issueListRegex.test(window.location.href)) {
    enhanceIssueList();
  }

  if (epicListRegex.test(window.location.href)) {
    // epic list has the same style with issue list.
    enhanceIssueList();
  }

  if (issueBoardRegex.test(window.location.href)) {
    enhanceIssueBoard();
  }
};
// Run the script when the DOM is fully loaded
window.onload = enhance;
// Run the script when the URL is changed

if (window.onurlchange === null) {
  // feature is supported
  window.addEventListener('urlchange', enhance);
}
