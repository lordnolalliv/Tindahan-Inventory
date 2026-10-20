import app from '../server.js'

export default function handler(request, response) {
  const route = request.query?.route
  if (typeof route === 'string') {
    request.url = route.startsWith('/') ? route : `/${route}`
  }

  return app(request, response)
}
