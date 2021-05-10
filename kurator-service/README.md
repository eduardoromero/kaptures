# Kurator Service

Kurator Service is part of KAPs Content Stack. Our team of Kap Kurators add games 
to our platform with all their details like where the game is available, categories, 
web page, game developer, etc.

They also write about games, achievements, and select the best Kaptures for the game's 
detail page on Kapture's Kaffe (our main website).

## How it works?

Just a centralized database that owns the definitions of the games. Kurators use our CMS
to add content there, a webhook publishes these updates on our system, and makes them 
available to our other systems via our centralized event bus.   