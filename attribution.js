// Copyright 2026 Matt Hall, Equinor // MIT license
$('.collapse').collapse();

// A port of the text-generation logic from IBM's AI Attribution tool
// (https://aiattribution.github.io), which is shared under an Apache 2.0 license.
const TAGS = {
  // 1. Proportion of contribution
  'entirely-ai':     { name: 'Entirely AI',     abbr: 'EAI', explanation: 'The work was entirely AI-generated.' },
  'primarily-ai':    { name: 'Primarily AI',    abbr: 'PAI', explanation: 'The work was primarily AI-generated.' },
  'blend':           { name: 'Human-AI blend',  abbr: 'HAb', explanation: 'The work was created with an even blend of human and AI contributions.' },
  'primarily-human': { name: 'Primarily human', abbr: 'Ph',  explanation: 'The work was primarily human-created.' },
  'entirely-human':  { name: 'Entirely human',  abbr: 'Eh',  explanation: 'This work was entirely human-created, without the use of AI.' },
  // 2. AI contributions
  'Se': { name: 'Stylistic edits', abbr: 'Se', explanation: 'AI was used to make stylistic edits, such as changes to structure, wording, and clarity.' },
  'Ce': { name: 'Content edits',   abbr: 'Ce', explanation: 'AI was used to make content edits, such as changes to scope, information, and ideas.' },
  'Nc': { name: 'New content',     abbr: 'Nc', explanation: 'AI was used to make new content, such as text, images, analysis, and ideas.' },
  // 3. Who initiated AI contributions
  'Hin': { name: 'Human-initiated', abbr: 'Hin', explanation: 'AI was prompted for its contributions, or AI assistance was enabled.' },
  'Ain': { name: 'AI-initiated',    abbr: 'Ain', explanation: 'The AI made proactive contributions, such as via auto-completion or unprompted changes.' },
  // 4. Human review
  'R':  { name: 'Reviewed',        abbr: 'R',  explanation: 'AI-generated content was reviewed and approved.' },
  'Nr': { name: 'No human review', abbr: 'Nr', explanation: 'AI-generated content was not reviewed.' },
};

const AIA = 'AIA';
const NO_AI_USED = 'No AI';
const LAST_VERSION = 'v1.0';
const BASE_URL = 'https://aiattribution.github.io';
const EMPTY_STATE = 'Fill out the form to get started.';
const AIA_EXPLANATION = 'AIA: This prefix is used to identify an AI attribution statement.';
const VERSION_EXPLANATION = `${LAST_VERSION}: Version number of the attribution statement. This number will change as the attribution tool evolves.`;

// Element references.
const emptyState = document.getElementById('emptyState');
const outputBody = document.getElementById('outputBody');
const modelInput = document.getElementById('model');
const fullStatementEl = document.getElementById('fullStatement');
const abbrStatementEl = document.getElementById('abbrStatement');
const expandedStatementEl = document.getElementById('expandedStatement');
const explanationBlockEl = document.getElementById('explanationBlock');

// Read the current form state into a plain object.
function getSelections() {
  const checked = name => document.querySelector(`input[name="${name}"]:checked`);
  const all = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
  return {
    proportion: checked('proportion') ? checked('proportion').value : '',
    contributions: all('contribution'),
    initiatives: all('initiative'),
    review: checked('review') ? checked('review').value : '',
    model: modelInput.value,
  };
}

function hasAnyResponse(sel) {
  return !!(sel.proportion || sel.contributions.length || sel.initiatives.length ||
            sel.review || sel.model.trim());
}

// True unless the proportion of contribution is exactly "Entirely human-created".
function isAIUsageYes(sel) {
  return sel.proportion !== 'entirely-human';
}

// Concatenate one field's selected options into a single string, using `key`
// ('name' or 'abbr') and joining the fragments within the field with `join`.
function concatField(values, key, join) {
  return values.map(v => (TAGS[v] ? TAGS[v][key] : '')).join(join);
}

// Concatenate one field's explanations, joined with spaces.
function concatExplanations(values) {
  return values.map(v => (TAGS[v] ? TAGS[v].explanation : '')).join(' ');
}

// Build the full or abbreviated statement text.
//   Full:        key='name', within=', ',  between=', '
//   Abbreviated: key='abbr', within='',     between=' '
function getStatementText(sel, key, within, between) {
  const modelSelected = sel.model;
  let aiUsed;
  if (isAIUsageYes(sel)) {
    aiUsed = modelSelected.trim() ? modelSelected : '';
    const components = [
      concatField(sel.proportion ? [sel.proportion] : [], key, within),
      concatField(sel.contributions, key, within),
      concatField(sel.initiatives, key, within),
      concatField(sel.review ? [sel.review] : [], key, within),
      aiUsed,
    ].filter(value => value.trim());
    return `${AIA} ${components.join(between)} ${LAST_VERSION}`;
  }
  aiUsed = NO_AI_USED;
  return `${AIA} ${aiUsed} ${LAST_VERSION}`;
}

// Build the canonical URL from the abbreviated statement. Faithful port of the
// original getCanonicalURL: the model text is spliced in as an embedded
// ?model=... fragment (dashes pre-escaped so they survive the space→dash pass).
function getCanonicalURL(abbreviatedStatement, sel) {
  const modelSelected = sel.model;
  let formatted = abbreviatedStatement;
  if (modelSelected.trim()) {
    const idx = abbreviatedStatement.lastIndexOf(modelSelected);
    if (idx !== -1) {
      formatted =
        abbreviatedStatement.slice(0, idx) +
        `?model=${encodeURIComponent(modelSelected.replace(/-/g, '%2D'))}` +
        abbreviatedStatement.slice(idx + modelSelected.length);
    }
  }
  formatted = formatted.trim().replace(/\s+/g, '-');
  return `${BASE_URL}/statements/${formatted}`;
}

// Build the expanded, prose explanation of the statement.
function getExpandedStatement(sel) {
  let proportion = concatExplanations(sel.proportion ? [sel.proportion] : [])
    .replace('The work', 'This work');
  let contribution = '';
  let initiatives = '';
  let review = '';
  let modelUsed = '';
  if (isAIUsageYes(sel)) {
    contribution = concatExplanations(sel.contributions);
    initiatives = concatExplanations(sel.initiatives);
    review = concatExplanations(sel.review ? [sel.review] : []);
    if (sel.model.trim()) {
      if (proportion || contribution || initiatives || review) {
        modelUsed = `The following model(s) or application(s) were used: ${sel.model}.`;
      } else {
        modelUsed = `This work involved the use of the following model(s) or application(s): ${sel.model}.`;
      }
    }
  }
  let content = `${proportion} ${contribution} ${initiatives} ${review} ${modelUsed}`;
  content = content.replace('.,', ',');
  return content.trim().replace(/\s+/g, ' ');
}

// Build the reader-facing "Explanation" decoder rows.
function getExplanationRows(sel) {
  const rows = [AIA_EXPLANATION];
  if (isAIUsageYes(sel)) {
    const fields = [
      sel.proportion ? [sel.proportion] : [],
      sel.contributions,
      sel.initiatives,
      sel.review ? [sel.review] : [],
    ];
    fields.forEach(values => {
      const abbr = concatField(values, 'abbr', '');
      const explanations = concatExplanations(values);
      const row = `${abbr ? abbr + ':' : ''} ${explanations}`.trim();
      if (row) rows.push(row);
    });
  }
  rows.push(VERSION_EXPLANATION);
  return rows;
}

// Render a statement as a clickable link (textContent set separately to avoid
// any injection from the model free-text field).
function renderLink(container, text, url) {
  container.innerHTML = '';
  const a = document.createElement('a');
  a.href = url;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener';
  container.appendChild(a);
}

// Current statement text, kept for the copy buttons.
let currentFull = '';
let currentAbbr = '';
let currentExpanded = '';
let currentUrl = '';

// Enable/disable and clear a form section by id.
function setSectionDisabled(id, disabled) {
  const section = document.getElementById(id);
  section.classList.toggle('section-disabled', disabled);
  section.querySelectorAll('input').forEach(el => {
    el.disabled = disabled;
    if (disabled) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else el.value = '';
    }
  });
}

// Apply the proportion-of-contribution constraints:
//   "Entirely AI-generated" disables section 2 (AI contributions);
//   "Entirely human-created" disables every other section.
function applyProportionConstraints() {
  const checked = document.querySelector('input[name="proportion"]:checked');
  const value = checked ? checked.value : '';
  const sections = ['sectionContribution', 'sectionInitiative', 'sectionReview', 'sectionModel'];
  sections.forEach(id => setSectionDisabled(id, false));
  if (value === 'entirely-ai') {
    setSectionDisabled('sectionContribution', true);
  } else if (value === 'entirely-human') {
    sections.forEach(id => setSectionDisabled(id, true));
  }
}

function updateOutputs() {
  applyProportionConstraints();
  const sel = getSelections();

  if (!hasAnyResponse(sel)) {
    emptyState.classList.remove('d-none');
    outputBody.classList.add('d-none');
    currentFull = '';
    currentAbbr = '';
    currentExpanded = '';
    currentUrl = '';
    return;
  }
  emptyState.classList.add('d-none');
  outputBody.classList.remove('d-none');

  currentFull = getStatementText(sel, 'name', ', ', ', ');
  currentAbbr = getStatementText(sel, 'abbr', '', ' ');
  currentExpanded = getExpandedStatement(sel);
  currentUrl = getCanonicalURL(currentAbbr, sel);

  renderLink(fullStatementEl, currentFull, currentUrl);
  renderLink(abbrStatementEl, currentAbbr, currentUrl);
  expandedStatementEl.textContent = currentExpanded;

  explanationBlockEl.innerHTML = '';
  getExplanationRows(sel).forEach(row => {
    const div = document.createElement('div');
    div.className = 'mb-2';
    const idx = row.indexOf(':');
    if (idx !== -1) {
      const strong = document.createElement('strong');
      strong.textContent = row.slice(0, idx);
      div.appendChild(strong);
      div.appendChild(document.createTextNode(row.slice(idx)));
    } else {
      div.textContent = row;
    }
    explanationBlockEl.appendChild(div);
  });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Copy the plain statement text and show the shared toast.
async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

// Copy the statement to the clipboard with two flavours: a rich text/html
// version wrapping the statement in a link (used when pasting into rich targets
// like Google Slides), and a text/plain version of just the statement (used by
// plain-text targets like VS Code).
async function copyLinked(text, url) {
  if (!text) return;
  try {
    if (url && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const html = `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      showToast('Copied to clipboard');
      return;
    }
    // Fall back to plain text where the async Clipboard API is unavailable.
    await copyText(text);
  } catch (err) {
    console.error('Failed to copy:', err);
    await copyText(text);
  }
}

document.getElementById('copyFull').addEventListener('click', () => copyLinked(currentFull, currentUrl));
document.getElementById('copyAbbr').addEventListener('click', () => copyLinked(currentAbbr, currentUrl));
document.getElementById('copyExpanded').addEventListener('click', () => copyText(currentExpanded));

// React to any change in the form.
document.querySelectorAll('#attributionForm input').forEach(el => {
  el.addEventListener('change', updateOutputs);
  el.addEventListener('input', updateOutputs);
});

updateOutputs();
