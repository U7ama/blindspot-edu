"""Read older saved lessons without inventing missing assessment answers."""
from copy import deepcopy

from pydantic import ValidationError

from .contracts import Document


def load_saved_document(payload):
    try:
        return Document.model_validate(payload), []
    except ValidationError as exc:
        errors = exc.errors(include_input=False, include_context=False, include_url=False)
        # A public (redacted) export was sometimes saved as the server document.
        # Only optional phase quizzes missing grading metadata can be omitted.
        # All other invalid content still fails validation.
        if not errors or not all(
            error['type'] == 'missing'
            and len(error['loc']) == 4
            and error['loc'][0] == 'phases'
            and isinstance(error['loc'][1], int)
            and error['loc'][2] == 'quiz'
            and error['loc'][3] in ('correct_index', 'explanation')
            for error in errors
        ):
            raise
        compatible = deepcopy(payload)
        for index in {error['loc'][1] for error in errors}:
            compatible['phases'][index]['quiz'] = None
        document = Document.model_validate(compatible)
        return document, [
            'Some saved quizzes are unavailable because their grading data is missing. '
            'Lecture text and source evidence remain available.'
        ]
