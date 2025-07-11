# label-ai

A tiny app for labeling AI-generated images.

You can download this repository and run it right on your computer, or use [the deployed version](https://equinor.github.io/label-ai/).

<img width="500" alt="image" src="https://github.com/user-attachments/assets/5ac2ad15-4025-4d5b-a687-49963e2b3855" />


## Labeling images

The image can be labeled in one or both of two different ways:

- A note or symbol can be embedded in the pixels of the image. This is visible to the viewer and cannot be removed except by cropping.
- Text, such as a prompt, can be embedded in the pixels of the alpha channel of the image (optional). This is not visible to the viewer.

If the uploaded image has [Content Credntials](https://contentcredentials.org/), these are accessible through the **cr** logo on the image.


## Labeling text

Text can be tagged by one of several invisible methods, such as inserting a zero-width symbol before each word. The text is still readable.
