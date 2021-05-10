@app
kurator-service

@http
get /

get /api/games

post /webhooks/games

@tables
games
  id *String

kaptures
  id *String

@active-tracing

@macros
tracing

@aws
runtime nodejs14.x
region us-west-1
tracing active
# profile default
