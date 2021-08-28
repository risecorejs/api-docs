new Vue({
  data: {
    loading: true,
    routes: [],
    options: {
      title: 'API-docs',
      baseUrl: ''
    },
    authorization: '',
    methods: [],
    filter: {
      searchText: '',
      method: null
    },
    bodyUITypes: ['string', 'number', 'boolean'],
    visibleEndpointGroups: {}
  },
  el: '#app',
  watch: {
    authorization(newVal, oldVal) {
      localStorage.authorization = newVal
    }
  },
  computed: {
    groupRoutes() {
      const baseUrl = this.options.baseUrl

      const generateRoutes = (route) => {
        const routes = []

        const recursiveFilling = (rawRoutes, parentUrl = '') => {
          for (const route of rawRoutes) {
            const url = parentUrl + (route.url ?? '')
            const routeDocs = route.docs

            if (route.method && route.controller) {
              const obj = {
                method: route.method,
                url,
                controller: route.controller,
                dev: route.dev,
                docs: routeDocs ?? {},
                initialState: {
                  url: baseUrl + url,
                  params: [{ enable: false, key: '', value: '' }],
                  headers: [{ enable: false, key: '', value: '' }],
                  body: '',
                  bodyUI: false,
                  bodyFormData: false,
                  bodyUIData: [
                    {
                      enable: false,
                      key: '',
                      value: '',
                      type: 'string',
                      files: null
                    }
                  ]
                }
              }

              if (routeDocs) {
                const docsFormatter = (entity) => {
                  const array = []

                  if (routeDocs[entity]) {
                    for (const key in routeDocs[entity]) {
                      array.push({
                        enable: routeDocs[entity][key].enable,
                        key,
                        value: routeDocs[entity][key].value
                      })
                    }
                  }

                  return array
                }

                obj.initialState.params.unshift(...docsFormatter('params'))
                obj.initialState.headers.unshift(...docsFormatter('headers'))

                const bodyJSON = {}
                const bodyUIData = []

                const body = routeDocs['body']

                for (const key in body) {
                  const bodyItem = body[key]

                  bodyJSON[key] = bodyItem.value

                  if (
                    this.bodyUITypes.find(
                      (bodyUIType) => bodyItem.type == bodyUIType
                    ) ||
                    (bodyItem.type === 'files' && routeDocs.bodyFormData)
                  ) {
                    bodyUIData.push({
                      enable: bodyItem.enable ?? true,
                      key,
                      value: bodyItem.value,
                      type: bodyItem.type,
                      required: bodyItem.required,
                      variants: bodyItem.variants ?? []
                    })
                  }
                }

                Object.assign(obj.initialState, {
                  body: JSON.stringify(bodyJSON, null, 2),
                  bodyUI: !!routeDocs.bodyUI,
                  bodyFormData: !!routeDocs.bodyFormData
                })

                obj.initialState.bodyUIData.unshift(...bodyUIData)
              }

              routes.push(obj)

              if (!this.methods.includes(route.method)) {
                this.methods.push(route.method)
              }
            }

            if (route.children?.length) {
              recursiveFilling(route.children, url)
            }
          }
        }

        recursiveFilling([route])

        return routes
      }

      const groupRoutes = this.routes.map((route) => {
        const routeGroup = {
          group: route.group,
          routes: generateRoutes(route)
        }

        return routeGroup
      })

      return groupRoutes
    },
    groupRoutesFiltered() {
      const groupRoutes = JSON.parse(JSON.stringify(this.groupRoutes))

      const groupRoutesFiltered = groupRoutes.filter((groupRoute) => {
        groupRoute.routes = groupRoute.routes
          .filter((route) => {
            if (this.filter.method) {
              if (
                route.method.toLowerCase() === this.filter.method.toLowerCase()
              ) {
                return true
              } else {
                return false
              }
            } else {
              return true
            }
          })
          .filter((route) => {
            if (this.filter.searchText) {
              if (
                route.url.toLowerCase().includes(this.filter.searchText) ||
                route.controller.includes(this.filter.searchText) ||
                route.method
                  .toLowerCase()
                  .includes(this.filter.searchText.toLowerCase()) ||
                route.docs?.description
                  ?.toLowerCase()
                  .includes(this.filter.searchText.toLowerCase())
              ) {
                return true
              }
            } else {
              return true
            }
          })

        return !!groupRoute.routes.length
      })

      return groupRoutesFiltered
    },
    countEndpoints() {
      const count = this.groupRoutesFiltered.reduce(
        (acc, routeGroup) => acc + routeGroup.routes.length,
        0
      )

      return count
    }
  },
  methods: {
    collapseEndpointGroup(groupName, event) {
      this.visibleEndpointGroups = {
        ...this.visibleEndpointGroups,
        [groupName]: event === 'show'
      }

      localStorage.visibleEndpointGroups = JSON.stringify(
        this.visibleEndpointGroups
      )
    },
    async fetchRoutes() {
      const url = new URL(location.href)

      const { data } = await axios.get(url.pathname + '/data')

      this.routes = data.routes
      this.options = data.options
    },
    getVariantMethod(method) {
      switch (method.toLowerCase()) {
        case 'get':
          return 'primary'
        case 'post':
          return 'dark'
        case 'put':
          return 'info'
        case 'patch':
          return 'success'
        case 'delete':
          return 'danger'

        default:
          break
      }
    }
  },
  async mounted() {
    this.fetchRoutes()

    if (localStorage.visibleEndpointGroups) {
      this.visibleEndpointGroups = JSON.parse(
        localStorage.visibleEndpointGroups
      )
    }

    this.loading = false
    this.authorization = localStorage.authorization ?? ''
  }
})

Vue.component('endpoint', {
  template: '#endpoint-template',
  props: ['route', 'index', 'authorization', 'get-variant-method'],
  data: () => ({
    requestParameters: false,
    showMore: false,
    initialState: {
      finished: false,
      response: null
    },
    state: {}
  }),
  watch: {
    'state.bodyFormData'(newVal, oldVal) {
      if (newVal) {
        this.state.bodyUIData = this.state.bodyUIData.filter(
          (bodyUIData) =>
            bodyUIData.type === 'string' || bodyUIData.type === 'files'
        )
      } else {
        this.state.bodyUIData = this.state.bodyUIData.filter(
          (bodyUIData) => bodyUIData.type !== 'files'
        )
      }

      if (!this.state.bodyUIData.length) {
        this.state.bodyUIData.push({
          enable: false,
          key: '',
          value: '',
          type: 'string',
          files: null
        })
      }
    }
  },
  methods: {
    onFiles($event, index) {
      this.state.bodyUIData[index].files = $event.target.files
    },
    getValue(value) {
      if (value) {
        if (typeof value === 'string') {
          return `"${value}"`
        } else {
          return value
        }
      }
    },
    getVariantStatusCode(statusCode) {
      statusCode = String(statusCode)

      if (statusCode.startsWith('1')) {
        return 'secondary'
      } else if (statusCode.startsWith('2')) {
        return 'success'
      } else if (statusCode.startsWith('3')) {
        return 'info'
      } else if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
        return 'danger'
      }
    },
    bootstrap() {
      this.initialState = JSON.parse(
        JSON.stringify({
          ...this.initialState,
          ...this.route.initialState
        })
      )

      this.state = JSON.parse(JSON.stringify({ ...this.initialState }))
    },
    reset() {
      this.bootstrap()
    },
    add(entity, type) {
      const requestEntity = this.state[entity]

      const lastElement = requestEntity[requestEntity.length - 1]

      if (lastElement.key || (lastElement.key && type === 'files')) {
        lastElement.enable = true

        const obj = {
          enable: false,
          key: '',
          value: ''
        }

        if (entity === 'bodyUIData') {
          Object.assign(obj, {
            type: 'string'
          })
        }

        requestEntity.push(obj)
      }
    },
    destroy(entity, index) {
      this.state[entity].splice(index, 1)
    },
    async run() {
      const formatter = (key) => {
        const obj = {}

        for (const item of this.state[key]) {
          if (item.enable && item.key) {
            obj[item.key] = item.value
          }
        }

        return obj
      }

      const params = formatter('params')
      const headers = formatter('headers')

      if (this.authorization) {
        headers['Authorization'] = this.authorization
      }

      const data = {}
      const fd = new FormData()

      if (this.state.bodyUI) {
        for (const item of this.state.bodyUIData) {
          if (item.enable && item.key) {
            if (this.state.bodyFormData) {
              if (item.files?.length) {
                for (const file of item.files) {
                  fd.append(item.key, file)
                }
              } else {
                fd.append(item.key, item.value)
              }
            } else {
              const getTypedValue = (type) => {
                switch (type) {
                  case 'string':
                    return String(item.value)

                  case 'number':
                    return Number(item.value)

                  case 'boolean':
                    return Boolean(item.value)

                  default:
                    break
                }
              }

              data[item.key] = getTypedValue(item.type)
            }
          }
        }
      } else if (this.state.body) {
        Object.assign(data, JSON.parse(this.state.body))
      }

      try {
        const config = {
          method: this.route.method.toLowerCase(),
          url: this.state.url,
          params,
          headers,
          data: this.state.bodyFormData ? fd : data
        }

        const res = await axios(config)

        this.state.response = res
      } catch (err) {
        this.state.response = err.response
      }

      this.state.finished = true
    }
  },
  computed: {
    bodyView() {
      const view = this.state.bodyUI ? 'UI' : 'JSON'

      return view
    },
    stateChanged() {
      const changed =
        JSON.stringify(this.initialState) !== JSON.stringify(this.state)

      return changed
    },
    formattedUrl() {
      let url = this.state.url + '?'

      if (this.state.params?.length) {
        for (const param of this.state.params) {
          if (param.enable && param.key) {
            url += param.key + '=' + param.value + '&'
          }
        }
      }

      url = url.slice(0, -1)

      return url
    }
  },
  mounted() {
    this.bootstrap()
  }
})
