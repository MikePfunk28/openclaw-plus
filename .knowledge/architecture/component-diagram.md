```mermaid
graph TB
    api[API Gateway]
    ai[AI Engine]
    db[(Database)]
    api --> ai
    ai --> db

classDef frontend fill:#e1f5fe
classDef service fill:#fff3e0
classDef database fill:#e8f5e9
classDef queue fill:#fce4ec


class api service
class ai service
class db database

```