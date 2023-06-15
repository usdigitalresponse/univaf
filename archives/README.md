# Historical Archives Documentation

This directory hosts the source code for public documentation about UNIVAF's historical archives, which live at https://archives.getmyvax.org/. The docs site is built with [MkDocs](https://www.mkdocs.org/) and the [Material Theme](https://squidfunk.github.io/mkdocs-material/), and get published to `archives.getmyvax.org/docs/` (so they are clearly separated from the actual archive data).

There is also a `index.html` that redirects from `/` to `/docs/` to send browsers that visit `archives.getmyvax.org/` to the docs.


## Setup

1. Make sure you have a recent version of Python 3 (MkDocs is Python-based).

2. Run `./setup.sh` to set up a Python virtual environment and install the dependencies.

    This will set up the virtual environment in a `.venv` folder inside this folder, then use `pip` to install the dependencies from `requirements.txt`.

3. To use MkDocs, run `./run-mkdocs.sh <your> <args> <here>`.

    - To run the development server: `./run-mkdocs.sh serve`
    - To create a static build: `./run-mkdocs.sh build`

    You can also activate the virtual environment and run mkdocs directly instead of using the helper:

    ```bash
    # Activate the Python virtual environment:
    source ./.venv/bin/activate

    # Run mkdocs:
    mkdocs serve

    # When you're done, deactivate the virtual environment:
    deactivate
    ```
