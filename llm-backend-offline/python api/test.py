from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
import uvicorn

app = FastAPI(title="TraycerClone API", version="1.0")

@app.get("/hi", response_class=PlainTextResponse)
def hi() -> PlainTextResponse:
    """
    Simple endpoint that returns the text 'HI'.
    Use this to verify the API server is running and handling requests.
    """
    return PlainTextResponse("HI")


if __name__ == "__main__":
    # Run the app directly with: python "python api/test.py"
    # Or run with uvicorn: uvicorn "test:app" --host 127.0.0.1 --port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)
