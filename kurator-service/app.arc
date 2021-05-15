@app
kurator-service

@http
get /
get /api/games
get /api/games/:game
get /api/categories
get /api/categories/:category

post /webhooks/games

@events
game-updates

@tables
games
  id *String

categories
  PK *String
  categoryGameTs **String

kaptures
  id *String

@indexes
categories
  name gamesPerCategory
  category *String
  game **String

@active-tracing

@macros
tracing

@aws
runtime nodejs14.x
region us-west-1
tracing active
# profile default
