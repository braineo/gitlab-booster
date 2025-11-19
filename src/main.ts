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
  note: string;
  author: User;
}

interface MergeRequestDiscussion {
  resolved: boolean;
  resolvable: boolean;
  individual_note: boolean;
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
  iid: number;
  project_id: number;
  author: User;
  state: string;
  assignees: User[];
  reviewers: User[];
}

interface IterationEvent {
  id: number;
  user: User;
  action: string;
}

interface User {
  id: number;
  username: string;
  name: string;
}

interface MergeRequestThreadAction {
  /** number of threads waiting for others reply to discussion started by us */
  waitForTheirsCount: number;
  /** number of threads waiting for us to reply or resolve */
  waitForOursCount: number;
  /** number of other open threads */
  otherUnresolvedCount: number;
  /** whether user has reviewed the merge request */
  needUserReview: boolean;
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

function createThreadActionBadges(
  element: HTMLElement,
  action: MergeRequestThreadAction,
) {
  const li = $('<li/>')
    .addClass('issuable-comments d-none d-sm-flex')
    .prependTo(element);

  const createIconText = (
    icon: string,
    title: string,
    text?: string,
    badgeClassName?: string,
  ) => {
    return $('<span/>', {
      title,
      class: `gl-badge badge badge-pill ${
        badgeClassName ? `badge-${badgeClassName}` : ''
      } sm has-tooltip`,
    })
      .css({
        'font-family': 'SauceCodePro Mono',
      })
      .text(`${icon} ${text ?? ''}`);
  };

  if (action.waitForOursCount) {
    createIconText(
      '\uf063',
      'need your response',
      action.waitForOursCount.toString(),
      'danger',
    ).prependTo(li);
  }

  if (action.waitForTheirsCount) {
    createIconText(
      '\uf062',
      'wait for response',
      action.waitForTheirsCount.toString(),
      'muted',
    ).prependTo(li);
  }

  if (action.otherUnresolvedCount) {
    createIconText(
      '\uf0e5',
      'other threads',
      action.otherUnresolvedCount.toString(),
      'warning',
    ).prependTo(li);
  }

  if (action.needUserReview) {
    createIconText('\uf256', 'need your review', undefined, 'danger').prependTo(
      li,
    );
  }
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
        class: 'diff-stats-group gl-display-flex gl-align-items-center bold',
      })
        .css({
          color: 'var(--gl-color-green-600)',
        })
        .append($('<span/>').text('+'), $('<span/>').text(`${addLineCount}`)),

      $('<div/>', {
        class: 'diff-stats-group gl-display-flex gl-align-items-center bold',
      })
        .css({
          color: 'var(--gl-color-red-600)',
        })
        .append($('<span/>').text('-'), $('<span/>').text(`${deleteLinCount}`)),
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

function createIssueCardIterationInfo(element: HTMLElement, rollover: number) {
  if (rollover < 1) {
    return;
  }
  const inline = $('<span/>').appendTo(element);
  $('<div/>', {
    class:
      'issue-milestone-details gl-flex gl-max-w-15 gl-gap-2 gl-mr-3 gl-inline-flex gl-max-w-15 gl-cursor-help gl-items-center gl-align-bottom gl-text-sm gl-text-gray-500',
  })
    .append(
      $('<span/>', {
        class: 'gl-inline-block gl-truncate gl-font-bold',
      }).text(`🔄×${rollover}`),
    )
    .appendTo(inline);
}

function ensurePanelLayout() {
  // ensure two column scroll structure
  const layout = document.querySelector('div.layout-page');
  if (!layout) {
    return;
  }

  $(layout).css({ display: 'flex' });
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

const createOpenModalButton = (url: string) => {
  return $('<button/>', { class: 'btn btn-default btn-sm gl-button' })
    .css({
      'font-family': 'SauceCodePro Mono',
    })
    .text('\uf08e')
    .on('click', e => {
      e.stopPropagation();
      openModal(url);
    });
};

export const openModal = (url: string) => {
  let modal = $('#gitlab-booster-modal');

  if (!modal.length) {
    // Create the modal only if it doesn't exist
    const modalContent = $('<div/>', { class: 'modal-content' }).append(
      $('<header/>', { class: 'modal-header' }).append(
        $('<h2/>', { textContent: 'Quick preview' }),
        $('<button/>', {
          class:
            'btn btn-default btn-md gl-button btn-close js-note-target-close btn-comment btn-comment-and-close',
        })
          .append($('<span/>').text('Close Modal'))
          .on('click', () => {
            modal.hide();
          }),
      ),
    );

    modal = $('<div/>', {
      id: 'gitlab-booster-modal',
      class: 'modal fade show gl-modal',
    })
      .append(
        $('<div/>', { class: 'modal-dialog modal-lg' })
          .css({ 'max-width': '80vw' })
          .append(modalContent),
      )
      .appendTo($('body'));

    GM_addElement(modalContent[0], 'iframe', {
      id: 'issue-booster',
      className: 'modal-body',
      // @ts-ignore // typing says style is readonly
      style: 'height: 80vh;',
    });
  }

  const iframe = modal.find('#issue-booster')[0] as HTMLIFrameElement;
  if (iframe && iframe.src !== url) {
    iframe.src = url;
  }

  modal.show();
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

  const listItem = await fetchGitLabData<MergeRequestListItem>(
    `${mergeRequestUrl}.json`,
  );

  if (!currentUser) {
    currentUser = await getUser();
  }

  const userId = currentUser?.id;

  // render simple badge if cannot get the user or the merge request detail from API
  let renderFallback = true;

  if (listItem && userId) {
    const mergeRequest = await fetchGitLabData<MergeRequest>(
      getApiUrl(
        `/projects/${encodeURIComponent(
          listItem.target_project_full_path,
        )}/merge_requests/${listItem.iid}`,
      ),
    );

    if (mergeRequest) {
      const action: MergeRequestThreadAction = {
        waitForOursCount: 0,
        waitForTheirsCount: 0,
        otherUnresolvedCount: 0,
        needUserReview: false,
      };

      const isUserAuthor = mergeRequest.author.id === userId;
      const isUserReviewer =
        mergeRequest.assignees.some(user => user.id === userId) ||
        mergeRequest.reviewers.some(user => user.id === userId);

      if (isUserAuthor) {
        renderFallback = false;
        for (const discusstion of discussions) {
          if (
            discusstion.resolvable &&
            !discusstion.resolved &&
            discusstion.notes.length > 0
          ) {
            // biome-ignore lint: cannot be empty
            if (discusstion.notes.at(-1)!.author.id === userId) {
              action.waitForTheirsCount += 1;
            } else {
              action.waitForOursCount += 1;
            }
          }
        }

        createThreadActionBadges(element, action);
      } else if (isUserReviewer) {
        renderFallback = false;
        action.needUserReview = true;

        for (const discusstion of discussions) {
          if (
            discusstion.resolvable &&
            !discusstion.resolved &&
            discusstion.notes.length > 0
          ) {
            // biome-ignore lint: cannot be empty
            if (discusstion.notes.at(0)!.author.id === userId) {
              action.needUserReview = false;
              // biome-ignore lint: cannot be empty
              if (discusstion.notes.at(-1)!.author.id === userId) {
                action.waitForTheirsCount += 1;
              } else {
                action.waitForOursCount += 1;
              }
            }
          }

          if (discusstion.individual_note && discusstion.notes.length > 0) {
            const note = discusstion.notes[0];

            if (
              (note.note === 'requested changes' ||
                note.note === 'approved this merge request') &&
              note.author.id === userId
            ) {
              action.needUserReview = false;
            }
          }

          action.otherUnresolvedCount =
            resolvable -
            resolved -
            action.waitForTheirsCount -
            action.waitForOursCount;
        }

        createThreadActionBadges(element, action);
      }
    }
  }

  if (!renderFallback) {
    return;
  }

  if (resolvable > resolved) {
    createThreadsBadge(element, 'danger', resolved, resolvable);
  } else if (resolved === resolvable && resolvable > 0) {
    createThreadsBadge(element, 'success', resolved, resolvable);
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

    createOpenModalButton(mergeRequestUrl)
      .css({
        paddingTop: 0,
        paddingBottom: 0,
      })
      .appendTo(metaList);
  }
}

async function enhanceMergeRequestDetailPage() {
  const reviewerPanel = document.querySelector('.block.reviewer');

  const getTitle = () => {
    return document.querySelector<HTMLElement>('h1.title')?.innerText ?? '';
  };
  const title = getTitle();
  document.querySelector<HTMLElement>('h1.title')?.innerText ?? '';
  const csrfToken = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  )?.content;

  const mrisDraft =
    title.length > 0 && title.toLowerCase().startsWith('draft:');

  if (!reviewerPanel) {
    return;
  }

  const convertButton = reviewerPanel.querySelector('#convert-to-draft-button');

  if (mrisDraft && convertButton) {
    convertButton.remove();
    return;
  }

  if (!mrisDraft && !convertButton && csrfToken) {
    const $description = $(/* HTML */ `
      <div
        id="convert-to-draft-button"
        class="gl-flex"
        style="padding-top: 1rem; align-items: center"
      >
        <span class="gl-mb-0 gl-inline-block gl-text-sm gl-text-subtle"
          >Still in progress?</span
        >
        <button
          class="gl-ml-2 !gl-text-sm btn gl-button btn-confirm btn-sm btn-confirm-tertiary"
        >
          <span class="gl-button-text" style="font-size: 0.7rem;"
            >Convert to draft</span
          >
        </button>
      </div>
    `);

    $description.find('.gl-button').on('click', async () => {
      const urlMatch = window.location.pathname.match(
        /\/(.+)\/-\/merge_requests\/(\d+)/,
      );

      if (!urlMatch) {
        console.error('Could not parse MR URL');
        return;
      }

      const projectPath = urlMatch[1];
      const mrIid = urlMatch[2];
      const title = getTitle();
      await fetch(
        getApiUrl(
          `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`,
        ),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ title: `Draft: ${title}` }),
        },
      );
      window.location.reload();
    });

    $description.appendTo(reviewerPanel);
  }
}

// Function to enhance the issue detail page with related project names of merge requests
async function enhanceIssueDetailPage() {
  // select related items and exclude related issue
  // need to wait for the list to show up as the issue page loads first then loads the related merge request asynchronously
  waitForKeyElements(
    '#developmentitems > div.crud-body > div > ul > li',
    (mergeRequest: Element) => {
      (async () => {
        console.debug(
          'inserting merge request meta to related merge requests',
          mergeRequest,
        );

        const statusBadge = mergeRequest.querySelector(
          'div.item-meta span.gl-badge-content',
        );

        const mergeRequestStatus = statusBadge?.textContent ?? 'opened';

        const mergeRequestAnchor =
          mergeRequest.querySelector<HTMLAnchorElement>('.item-title a');

        const mergeRequestUrl = mergeRequestAnchor?.href;

        if (!mergeRequestUrl) {
          return;
        }

        switch (mergeRequestStatus?.trim().toLowerCase()) {
          case 'merged': {
            break;
          }

          case 'closed': {
            $(mergeRequestAnchor).css({
              'text-decoration': 'line-through',
            });
            $(mergeRequest).css({
              filter: 'grayscale(1)',
            });
            // no need to show the closed details
            return;
          }
          default: {
            $(mergeRequestAnchor).css({
              color: 'var(--primary)',
            });
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

        createOpenModalButton(mergeRequestUrl).appendTo(metaDiv);

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
          // Collect merge requests for the issue
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

          // Collect rollover count for the issue
          const iterationEvents =
            (await fetchGitLabData<IterationEvent[]>(
              getApiUrl(
                `/projects/${issue.project_id}/issues/${issue.iid}/resource_iteration_events`,
              ),
            )) ?? [];

          createIssueCardIterationInfo(
            infoItems,
            iterationEvents.filter(event => event.action === 'add').length - 1,
          );
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

const mergeRequestDetailRegex = /\/merge_requests\/(\d+)/;

const mergeRequestListRegex = /\/merge_requests(?!\/\d+)/;

const epicListRegex = /\/epics(?!\/\d+)/;

// When the board is the only board in the repo, the url is `/boards`
const issueBoardRegex = /\/boards(?:\/\d+)?(?:\/)?(?:\?|$)/;

const enhance = () => {
  if (mergeRequestListRegex.test(window.location.href)) {
    enhanceMergeRequestList();
  }

  if (mergeRequestDetailRegex.test(window.location.href)) {
    enhanceMergeRequestDetailPage();
  }

  if (issueDetailRegex.test(window.location.href)) {
    enhanceIssueDetailPage();
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
