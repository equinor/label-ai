// Copyright 2026 Matt Hall, Equinor // MIT license
$('.collapse').collapse();
const processButton = document.getElementById('processButton');
const inputText = document.getElementById('inputText');
const clearButton = document.getElementById('clearText');
const dummyButton = document.getElementById('dummyText');

// Joseph Weizenbaum, "Computer Power and Human Reason: From Judgment to Calculation" (1976), p. 558.
const dummyText = `I don't say that systems such as I have mentioned are necessarily evil—only that they may be and, what is most important, that their inevitability cannot be accepted by individuals claiming autonomy, freedom, and dignity. The individual computer scientist can and must decide. The determination of what the impact of computers on society is to be is, at least in part, in their hands.

[If] technology is a nightmare that appears to have its own inevitable logic, it is our nightmare. It is possible, given courage and insight, for humans to deny technology the prerogative to formulate human questions. It is possible to ask human questions and to find humane answers.`;

dummyButton.addEventListener('click', () => {
  inputText.value = dummyText;
  inputText.focus();
});

document.addEventListener('paste', async (event) => {
  event.preventDefault();  // prevent default paste behavior
  let clipboardText = '';

  if (event.clipboardData && event.clipboardData.getData) {
      clipboardText = event.clipboardData.getData('text/plain');
  } else if (navigator.clipboard) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
      }
  }

  inputText.value = clipboardText;
  inputText.focus();
});

function bookendEverything(text) {
  return '\u200E' + text + '\u200F';
}

function bookendParagraphs(text) {
  // split by paragraphs (split on two or more line breaks)
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map(p => '\u200E' + p + '\u200F').join('\n\n');
}

function bookendSentences(text) {
  // Split into paragraphs on two or more newlines
  const paragraphs = text.split(/\n{2,}/);

  // For each paragraph, split into sentences and bookend each sentence
  const processedParagraphs = paragraphs.map(paragraph => {
    // Match sentences (keep punctuation)
    const sentences = paragraph.match(/[^.!?]+[.!?]*/g) || [];

    // Bookend each sentence with LTR + RTL marks
    const bookendedSentences = sentences.map(s => '\u200E' + s.trim() + '\u200F');

    // Join sentences with a space inside the paragraph
    return bookendedSentences.join(' ');
  });

  // Join paragraphs back with two newlines
  return processedParagraphs.join('\n\n');
}

function prependEveryWord(text) {
  // Insert \u200E before every word character that starts a word.
  return text.replace(/\b(?=\w)/g, '\u200E');
}

function replaceSpaces(text) {
  // Replace plain spaces with four-per-em spaces.
  return text.replace(/ /g, '\u2005');
}

function replaceDashes(text) {
  // Replace hyphen-minus (U+002D) with hyphen (U+2010),
  // and em dash (U+2014) with horizontal bar (U+2015).
  return text.replace(/-/g, '\u2010').replace(/\u2014/g, '\u2015');
}

// The visible footnote line (em-dash separator + disclosure).
const FOOTNOTE = '\u2014\nThis text was produced with AI assistance.';

function addFootnote(text) {
  // Append a visible, plain-text disclosure as a separated footnote line.
  return text + '\n\n' + FOOTNOTE;
}

// Enable/disable the zero-width marks dropdown with its checkbox.
const optMarks = document.getElementById('optMarks');
const marksMode = document.getElementById('marksMode');
function syncMarksMode() {
  marksMode.disabled = !optMarks.checked;
}
optMarks.addEventListener('change', syncMarksMode);
syncMarksMode();

processButton.addEventListener('click', async () => {
  const text = inputText.value;
  let labeled = text;

  if (!text) {
    document.getElementById('visualizedText').innerHTML = '';
    return;
  }

  // Apply each selected transformation in turn. Marks first, then special
  // spaces (so any spaces added by the marks step get converted too), then
  // the footnote last so its text stays plain and readable.
  if (optMarks.checked) {
    switch (marksMode.value) {
      case 'everything':
        labeled = bookendEverything(labeled);
        break;
      case 'paragraphs':
        labeled = bookendParagraphs(labeled);
        break;
      case 'sentences':
        labeled = bookendSentences(labeled);
        break;
      case 'words':
        labeled = prependEveryWord(labeled);
        break;
    }
  }

  if (document.getElementById('optSpaces').checked) {
    labeled = replaceSpaces(labeled);
  }

  if (document.getElementById('optDashes').checked) {
    labeled = replaceDashes(labeled);
  }

  const footnoteAdded = document.getElementById('optFootnote').checked;
  if (footnoteAdded) {
    labeled = addFootnote(labeled);
  }

  try {
    await navigator.clipboard.writeText(labeled);
    console.log('Copied to clipboard!');
    showToast('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
  }

  const visualizedText = document.getElementById('visualizedText');
  function visualizeMarkers(text) {
    // Wrap each special character in a span so it's visible in the output.
    return text
      .replace(/\u2005/g, '<span class="tpm-space">\u2005</span>')
      .replace(/\u200E/g, '<span class="ltr-marker">\u200E</span>')
      .replace(/\u200F/g, '<span class="rtl-marker">\u200F</span>')
      .replace(/\u2010/g, '<span class="dash">\u2010</span>')
      .replace(/\u2015/g, '<span class="dash">\u2015</span>');
  }

  let visualized = visualizeMarkers(labeled);
  if (footnoteAdded) {
    // Colour the appended footnote purple in the visualized output.
    visualized = visualized.replace(FOOTNOTE, '<span class="footnote">' + FOOTNOTE + '</span>');
  }
  visualizedText.innerHTML = visualized;
});

clearButton.addEventListener('click', () => {
  inputText.value = '';
  document.getElementById('visualizedText').innerHTML = '';
});
