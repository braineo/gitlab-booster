import { GM_addElement } from "$";
import $ from "jquery";
import { waitForKeyElements } from "./waitForKeyElements";

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
  type: null | "LabelNote" | "DiscussionNote";
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
  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      console.error("Failed to fetch GitLab data:", response.statusText);
      return null;
    }
    return await response.json();
  } catch (error) {
    // network error or non-JSON body (e.g. sign-in page)
    console.error("Failed to fetch GitLab data:", error);
    return null;
  }
}

let currentUserPromise: Promise<User | null> | undefined;

//
// Element manipulation
//

// reuse GitLab's own icon sprite so injected icons match the native UI
const createIcon = (name: string, className = "", size = 14) => {
  const sprite =
    document.querySelector('svg use[href*=".svg#"]')?.getAttribute("href")?.split("#")[0] ?? "";
  return $(
    `<svg class="gl-icon s${size} ${className}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`,
  );
};

// inline layout: GitLab only ships the utility classes it uses itself, so `gl-gap-*` may not exist
const inlineRow = (gap: string) => ({ display: "inline-flex", "align-items": "center", gap });

const createBadge = (icon: string, title: string, text: string, variant: string) => {
  return $("<span/>", {
    title,
    "aria-label": title,
    class: `gl-badge badge badge-pill badge-${variant} has-tooltip`,
  }).append(createIcon(icon, "gl-badge-icon"), $("<span/>", { class: "gl-badge-content", text }));
};

const createMetaItem = (element: HTMLElement) => {
  return $("<li/>", { class: "issuable-comments" }).css(inlineRow("0.25rem")).prependTo(element);
};

function createThreadsBadge(
  element: HTMLElement,
  variant: string,
  resolved: number,
  resolvable: number,
) {
  createBadge(
    "comments",
    `${resolved} of ${resolvable} threads resolved`,
    `${resolved}/${resolvable}`,
    variant,
  ).appendTo(createMetaItem(element));
}

function createThreadActionBadges(element: HTMLElement, action: MergeRequestThreadAction) {
  const li = createMetaItem(element);

  if (action.needUserReview) {
    createBadge("eye", "Needs your review", "Review", "danger").appendTo(li);
  }

  if (action.waitForOursCount) {
    createBadge(
      "comment-dots",
      "Threads waiting for your response",
      action.waitForOursCount.toString(),
      "danger",
    ).appendTo(li);
  }

  if (action.waitForTheirsCount) {
    createBadge(
      "hourglass",
      "Threads waiting for their response",
      action.waitForTheirsCount.toString(),
      "neutral",
    ).appendTo(li);
  }

  if (action.otherUnresolvedCount) {
    createBadge(
      "comments",
      "Other unresolved threads",
      action.otherUnresolvedCount.toString(),
      "warning",
    ).appendTo(li);
  }
}

function createDiffStat(
  element: HTMLElement,
  fileCount: number,
  addLineCount: number,
  deleteLinCount: number,
) {
  $("<li/>", {
    class: "gl-text-subtle",
    title: `${fileCount} files changed, excluding tests, mocks, translations and lock files`,
  })
    // match the 12px MR reference text next to it
    .css({ ...inlineRow("0.5rem"), "font-size": "0.75rem", "font-variant-numeric": "tabular-nums" })
    .append(
      $("<span/>")
        .css(inlineRow("0.125rem"))
        .append(createIcon("doc-changes", "", 12), $("<span/>", { text: fileCount })),
      $("<span/>", { class: "gl-text-success", text: `+${addLineCount}` }),
      $("<span/>", { class: "gl-text-danger", text: `−${deleteLinCount}` }),
    )
    .prependTo(element);
}

const createBoardCardInfo = (element: HTMLElement, icon: string, title: string, text: string) => {
  $("<span/>", {
    title,
    class: "board-card-info gl-cursor-help gl-align-bottom gl-text-subtle",
  })
    .css({ ...inlineRow("0.25rem"), "font-size": "0.75rem" })
    .append(
      createIcon(icon, "board-card-info-icon"),
      $("<span/>", { class: "board-card-info-text", text }),
    )
    .appendTo(element);
};

function createIssueCardMergeRequestInfo(element: HTMLElement, opened: number, total: number) {
  createBoardCardInfo(
    element,
    "merge-request",
    "Closed / total related merge requests",
    total === 0 ? "-/-" : `${total - opened}/${total}`,
  );
}

function createIssueCardIterationInfo(element: HTMLElement, rollover: number) {
  if (rollover < 1) {
    return;
  }
  createBoardCardInfo(element, "retry", "Iteration rollovers", `×${rollover}`);
}

const createOpenModalButton = (url: string) => {
  return $("<button/>", {
    type: "button",
    title: "Quick preview",
    "aria-label": "Quick preview",
    class: "btn btn-default btn-sm gl-button btn-default-tertiary btn-icon has-tooltip",
  })
    .append(createIcon("external-link", "gl-button-icon"))
    .on("click", (e) => {
      e.stopPropagation();
      openModal(url);
    });
};

export const openModal = (url: string) => {
  let modal = $("#gitlab-booster-modal");

  if (modal.length === 0) {
    // Create the modal only if it doesn't exist
    const modalContent = $("<div/>", {
      class: "modal-content gl-overflow-hidden gl-rounded-lg gl-shadow-lg",
    }).append(
      $("<header/>", { class: "modal-header" }).append(
        $("<h2/>", { class: "modal-title gl-text-size-h2", text: "Quick preview" }),
        $("<button/>", {
          type: "button",
          title: "Close",
          "aria-label": "Close",
          class: "btn btn-default btn-sm gl-button btn-default-tertiary btn-icon",
        })
          .append(createIcon("close", "gl-button-icon"))
          .on("click", () => {
            modal.hide();
          }),
      ),
    );

    modal = $("<div/>", {
      id: "gitlab-booster-modal",
      class: "modal gl-modal",
      role: "dialog",
      "aria-modal": "true",
    })
      .css({ background: "rgba(0, 0, 0, 0.5)" })
      .append(
        $("<div/>", { class: "modal-dialog modal-dialog-centered" })
          .css({ "max-width": "min(80vw, 1400px)" })
          .append(modalContent),
      )
      // close when clicking the backdrop
      .on("click", (e) => {
        if (e.target === modal[0]) {
          modal.hide();
        }
      })
      .appendTo($("body"));

    $(document).on("keydown", (e) => {
      if (e.key === "Escape") {
        modal.hide();
      }
    });

    GM_addElement(modalContent[0], "iframe", {
      id: "issue-booster",
      className: "modal-body gl-p-0 gl-border-0",
      // @ts-expect-error // typing says style is readonly
      style: "height: 80vh; width: 100%;",
    });
  }

  const iframe = modal.find("#issue-booster")[0] as HTMLIFrameElement;
  if (iframe && iframe.src !== url) {
    iframe.src = url;
  }

  modal.show();
};

//
// Data process
//

const getUser = () => {
  return fetchGitLabData<User>(getApiUrl("/user"));
};

async function addMergeRequestThreadMeta(
  element: HTMLElement,
  mergeRequestUrl: string,
  // the MR list already shows GitLab's own "x of y" thread count
  showResolvedCount = true,
) {
  // Fetch unresolved threads from GitLab API
  const discussions =
    (await fetchGitLabData<MergeRequestDiscussion[]>(`${mergeRequestUrl}/discussions.json`)) ?? [];

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

  const listItem = await fetchGitLabData<MergeRequestListItem>(`${mergeRequestUrl}.json`);

  // share one request across all rows rendering in parallel
  currentUserPromise ??= getUser();

  const userId = (await currentUserPromise)?.id;

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
        mergeRequest.assignees.some((user) => user.id === userId) ||
        mergeRequest.reviewers.some((user) => user.id === userId);

      if (isUserAuthor) {
        renderFallback = false;
        for (const discusstion of discussions) {
          if (discusstion.resolvable && !discusstion.resolved && discusstion.notes.length > 0) {
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
            discusstion.notes.length > 0 &&
            discusstion.notes.at(0)!.author.id === userId
          ) {
            action.needUserReview = false;
            if (discusstion.notes.at(-1)!.author.id === userId) {
              action.waitForTheirsCount += 1;
            } else {
              action.waitForOursCount += 1;
            }
          }

          if (discusstion.individual_note && discusstion.notes.length > 0) {
            const note = discusstion.notes[0];

            if (
              (note.note === "requested changes" || note.note === "approved this merge request") &&
              note.author.id === userId
            ) {
              action.needUserReview = false;
            }
          }

          action.otherUnresolvedCount =
            resolvable - resolved - action.waitForTheirsCount - action.waitForOursCount;
        }

        createThreadActionBadges(element, action);
      }
    }
  }

  if (!renderFallback || !showResolvedCount) {
    return;
  }

  if (resolvable > resolved) {
    createThreadsBadge(element, "warning", resolved, resolvable);
  } else if (resolved === resolvable && resolvable > 0) {
    createThreadsBadge(element, "success", resolved, resolvable);
  }
}

async function addMergeRequestDiffMeta(element: HTMLElement, mergeRequestUrl: string) {
  const diffsMeta = await fetchGitLabData<DiffsMeta>(`${mergeRequestUrl}/diffs_metadata.json`);

  if (!diffsMeta) {
    return;
  }

  const { addedLineCount, deleteLinCount, fileCount } = dehydrateDiff(diffsMeta);

  createDiffStat(element, fileCount, addedLineCount, deleteLinCount);
}

function dehydrateDiff(diffsMeta: DiffsMeta) {
  const excludeRegexps = [
    // translation files
    /\.po$/u,
    /mocks/u,
    // tests
    /(spec|test)\.\w+$/u,
    // auto generated files
    /package-lock.json/u,
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
function enhanceMergeRequestList() {
  const mergeRequests = document.querySelectorAll(".merge-request");

  for (const mergeRequest of mergeRequests) {
    // project lists on newer GitLab render the title as `a.issue-title-text`
    const mergeRequestUrl = mergeRequest.querySelector<HTMLAnchorElement>(
      ".merge-request-title-text a, a.issue-title-text",
    )?.href;

    if (!mergeRequestUrl) {
      continue;
    }

    const metaList = $(mergeRequest).find(".issuable-meta ul, ul.controls")[0];

    addMergeRequestThreadMeta(metaList, mergeRequestUrl, false);
    addMergeRequestDiffMeta(metaList, mergeRequestUrl);

    createOpenModalButton(mergeRequestUrl).appendTo($("<li/>").appendTo(metaList));
  }
}

const getTitle = () => {
  return document.querySelector<HTMLElement>("h1.title")?.innerText ?? "";
};

function enhanceMergeRequestDetailPage() {
  const reviewerPanel = document.querySelector(".block.reviewer");

  const title = getTitle();

  const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;

  const mrisDraft = title.length > 0 && title.toLowerCase().startsWith("draft:");

  if (!reviewerPanel) {
    return;
  }

  const convertButton = reviewerPanel.querySelector("#convert-to-draft-button");

  if (mrisDraft && convertButton) {
    convertButton.remove();
    return;
  }

  if (!mrisDraft && !convertButton && csrfToken) {
    // HTML
    const $description = $(`
      <div id="convert-to-draft-button" class="gl-flex gl-items-center gl-gap-2 gl-pt-3">
        <span class="gl-text-sm gl-text-subtle">Still in progress?</span>
        <button type="button" class="btn gl-button btn-confirm btn-sm btn-confirm-tertiary">
          <span class="gl-button-text">Convert to draft</span>
        </button>
      </div>
    `);

    $description.find(".gl-button").on("click", async () => {
      const currentTitle = getTitle();
      // never overwrite the title with just the prefix
      if (!currentTitle) {
        console.error("Could not read MR title");
        return;
      }

      const urlMatch = window.location.pathname.match(/\/(.+)\/-\/merge_requests\/(\d+)/u);

      if (!urlMatch) {
        console.error("Could not parse MR URL");
        return;
      }

      const projectPath = urlMatch[1];
      const mrIid = urlMatch[2];
      const response = await fetch(
        getApiUrl(`/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ title: `Draft: ${currentTitle}` }),
        },
      );
      if (!response.ok) {
        console.error("Failed to convert to draft:", response.statusText);
        return;
      }
      window.location.reload();
    });

    $description.appendTo(reviewerPanel);
  }
}

// Function to enhance the issue detail page with related merge request meta
function enhanceIssueDetailPage() {
  // select related items and exclude related issue
  // need to wait for the list to show up as the issue page loads first then loads the related merge request asynchronously
  waitForKeyElements(
    "#developmentitems > div.crud-body > div > ul > li",
    (mergeRequest: Element) => {
      (async () => {
        console.debug("inserting merge request meta to related merge requests", mergeRequest);

        const statusBadge = mergeRequest.querySelector("div.item-meta span.gl-badge-content");

        const mergeRequestStatus = (statusBadge?.textContent ?? "opened").trim().toLowerCase();

        const mergeRequestAnchor = mergeRequest.querySelector<HTMLAnchorElement>(".item-title a");

        const mergeRequestUrl = mergeRequestAnchor?.href;

        if (!mergeRequestUrl) {
          return;
        }

        switch (mergeRequestStatus) {
          case "merged": {
            break;
          }

          case "closed": {
            $(mergeRequestAnchor).css({
              "text-decoration": "line-through",
            });
            $(mergeRequest).css({
              filter: "grayscale(1)",
            });
            // no need to show the closed details
            return;
          }
          default: {
            $(mergeRequestAnchor).css({
              color: "var(--gl-text-color-link, #1f75cb)",
            });
          }
        }

        const diffsMeta = await fetchGitLabData<DiffsMeta>(
          `${mergeRequestUrl}/diffs_metadata.json`,
        );

        if (!diffsMeta) {
          return;
        }

        const metaDiv = mergeRequest.querySelector<HTMLElement>(".item-meta .item-attributes-area");

        if (!metaDiv) {
          return;
        }

        // one container keeps our items together with even spacing, ahead of GitLab's own
        const boosterMeta = $("<span/>").css(inlineRow("0.75rem")).prependTo(metaDiv)[0];

        createOpenModalButton(mergeRequestUrl).appendTo(boosterMeta);

        if (mergeRequestStatus === "opened") {
          await addMergeRequestThreadMeta(boosterMeta, mergeRequestUrl);

          const { addedLineCount, deleteLinCount, fileCount } = dehydrateDiff(diffsMeta);
          createDiffStat(boosterMeta, fileCount, addedLineCount, deleteLinCount);
        }
      })();
    },
    true,
    300,
    // stop after ~30s so issues without merge requests do not poll forever
    100,
  );
}

async function addIssueCardInfo(node: Element) {
  // GitLab now links cards to `/-/work_items/:iid`, which has no `.json` endpoint
  const issueUrl = node
    .querySelector<HTMLAnchorElement>("h3.board-card-title > a")
    ?.href.replace("/-/work_items/", "/-/issues/");

  const infoItems = node.querySelector<HTMLElement>(".board-info-items");

  if (!issueUrl || !infoItems) {
    return;
  }

  const issue = await fetchGitLabData<Issue>(`${issueUrl}.json`);
  if (!issue) {
    return;
  }
  // Collect merge requests for the issue
  const relatedMergeRequest =
    (await fetchGitLabData<MergeRequest[]>(
      getApiUrl(`/projects/${issue.project_id}/issues/${issue.iid}/related_merge_requests`),
    )) ?? [];

  const total = relatedMergeRequest.length;

  const opened = relatedMergeRequest.filter(
    (mergeRequest) => mergeRequest.state === "opened",
  ).length;

  createIssueCardMergeRequestInfo(infoItems, opened, total);

  // Collect rollover count for the issue
  const iterationEvents =
    (await fetchGitLabData<IterationEvent[]>(
      getApiUrl(`/projects/${issue.project_id}/issues/${issue.iid}/resource_iteration_events`),
    )) ?? [];

  createIssueCardIterationInfo(
    infoItems,
    iterationEvents.filter((event) => event.action === "add").length - 1,
  );
}

const enhanceIssueCard: MutationCallback = (mutationList: MutationRecord[]) => {
  for (const mutation of mutationList) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      for (const added of mutation.addedNodes) {
        if (!(added instanceof Element)) {
          continue;
        }
        // cards may be mounted directly or inside a newly rendered list
        const cards = added.matches("li.board-card")
          ? [added]
          : added.querySelectorAll("li.board-card");
        for (const node of cards) {
          // cards load in parallel so a large board does not fill one by one
          addIssueCardInfo(node);
        }
      }
    }
  }
};

const observer = new MutationObserver(enhanceIssueCard);

const enhanceIssueBoard = () => {
  observer.disconnect();

  const boardElement = document.querySelector(".boards-list");
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

// GitLab now serves issues under `/-/work_items/:iid`
const issueDetailRegex = /\/(?:issues|work_items)\/\d+/u;

const mergeRequestDetailRegex = /\/merge_requests\/(\d+)/u;

const mergeRequestListRegex = /\/merge_requests(?!\/\d+)/u;

// When the board is the only board in the repo, the url is `/boards`; the board router appends `#/`
const issueBoardRegex = /\/boards(?:\/\d+)?(?:\/)?(?:\?|#|$)/u;

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

  if (issueBoardRegex.test(window.location.href)) {
    enhanceIssueBoard();
  }
};
// Run the script when the DOM is fully loaded
window.addEventListener("load", enhance);
// Run the script when the URL is changed

if (window.onurlchange === null) {
  // feature is supported
  window.addEventListener("urlchange", enhance);
}
