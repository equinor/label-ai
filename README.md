# label-ai

A tiny app for labeling AI-generated images.

You can download this repository and run it right on your computer, or use [the deployed version](https://equinor.github.io/label-ai/).

<img width="600" alt="Screenshot of the app" src="https://github.com/user-attachments/assets/16eb9201-55d9-419e-b7ee-f9fdb54c2187" />

This is a static app with no server; everything runs on your machine and nothing is communicated with anyone else.

> [!TIP]
> Interested in watermarking? Check out [`notebooks/Apply_and_detect_SynthID_watermarks.ipynb`](https://github.com/scienxlab/notebooks/blob/main/notebooks/Apply_and_detect_SynthID_watermarks.ipynb) (public) or [`watermark-demo`](https://github.com/equinor/watermark-demo) (Equinor only) for more on that.

## Features
### Creating attributions

Create an AI Attribution for any piece of work, created with any amount of AI generated content or assitance, using [IBM's attribution format](https://research.ibm.com/blog/AI-attribution-toolkit).

### Labeling images

Images can be labeled in one or both of two different ways:

- A note or symbol can be embedded in the pixels of the image. This is visible to the viewer and cannot be removed except by cropping.
- Text, such as a prompt, can be embedded in the pixels of the alpha channel of the image (optional). This is not visible to the viewer.

### Content credentials

The [Coalition for Content Provenance and Authenticity](https://c2pa.org/), or C2PA, has defined the [Content Credentials](https://contentcredentials.org/) protocol for lableing digital media such as images and video. Label AI allows you to detect and inspect these credentials, if present, or to attach (untrusted demo) credentials to an image.

### Labeling text

Text can be tagged by one of several invisible methods, such as inserting a zero-width symbol before each word. The text is still readable.

## See also

We maintain a few other repos containing learning material related to machine learning and artificial intelligence.

- [`promptly`](https://github.com/equinor/promptly) for more on prompting and pitfalls in generative AI.
- [`llm-engineering-101`](https://github.com/equinor/llm-engineering-101) for a short workshop aimed at getting developers up to speed.
- [`ml-pitfalls`](https://github.com/equinor/ml-pitfalls) for more on pitfalls in discriminative machine learning, another series of events.
- [`ai-upskill`](https://github.com/equinor/ai-upskill) for a repo describing Equinor's company upskill events and materials.
- [`figgy`](https://github.com/equinor/figgy) is a random collection of interactive slides and games for communicating about AI.
- [`ai-values`](https://github.com/kwinkunks/ai-values) for a small web app about human values and AI alignment.

---

&copy; 2024–2026 Equinor, AI Upskill | Licensed CC BY, please share this work.
