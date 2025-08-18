## local dev

create a .env file with your local db details:

```
DATABASE_URL=postgresql://localhost:5432/mhnodalnetwork?ssl=false
NODE_ENV=development
```

`heroku local web` to run it

pushing to master deploys to production so don't do it