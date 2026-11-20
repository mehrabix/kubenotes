---
title: 'Kubernetes Health Probes That Work Together'
description: 'Choose startup, readiness, and liveness probes for the jobs they are meant to do, with a Deployment example and verification commands.'
pubDate: 'Nov 20 2026'
---

Kubernetes has three health probes because “is the process alive?”, “has it finished starting?”, and “can it take traffic right now?” are different questions. Treating them as one check can turn a temporary dependency outage into a restart loop—or send requests to a container that is not ready.

## Give each probe one job

| Probe | Question | What Kubernetes does after repeated failures |
| --- | --- | --- |
| **Startup** | Has this container completed initialization? | Stops the container and applies its restart policy. Liveness and readiness checks wait until startup succeeds. |
| **Readiness** | Should this container receive Service traffic now? | Marks the Pod not ready; matching Service EndpointSlices reflect that it should not receive regular traffic. The container keeps running. |
| **Liveness** | Is this container so stuck it should be restarted? | Stops the container and applies its restart policy. |

For a Deployment, the Pod restart policy is `Always`. A liveness failure therefore restarts that container; it does not replace the Deployment or roll back the ReplicaSet. Readiness is not a restart mechanism.

## Start with health endpoints

For an HTTP application, implement separate, fast endpoints with clear semantics:

- `/health/startup` returns success only after initialization is complete.
- `/health/ready` returns success only while the instance can serve requests. It can account for a required dependency or temporary overload.
- `/health/live` returns success while the process can make progress. It should not fail merely because a database or another remote service is briefly unavailable.

The paths are examples, not built-in Kubernetes endpoints. Replace them with endpoints your application actually implements. An HTTP probe considers status codes from 200 through 399 successful; any other status is a failure.

## A Deployment and Service template

Save this as `web.yaml`. Replace the example image and health paths for your application before applying it:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/example/web:1.0
          ports:
            - name: http
              containerPort: 8080
          startupProbe:
            httpGet:
              path: /health/startup
              port: http
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 24
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: default
spec:
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: http
```

The startup probe allows roughly two minutes for initialization: 24 failures at five-second intervals. Until it succeeds, Kubernetes does not run the readiness or liveness probes. If startup continues to fail past that budget, Kubernetes restarts the container; it will try again according to the Pod's restart policy.

The readiness probe tolerates two consecutive failures before marking the Pod not ready. It keeps checking, so the Pod can become ready again after the application recovers. The liveness probe tolerates three consecutive failures before restarting the container. Tune these thresholds to your application's response times and recovery behavior; they are not universal values.

## Apply and verify

After changing the image and endpoint paths to match your app:

```sh
kubectl apply -f web.yaml
kubectl rollout status deployment/web
kubectl get pods -l app=web -w
```

Check which addresses a Service can route to:

```sh
kubectl get endpointslices \
  -l kubernetes.io/service-name=web \
  -o wide
```

An unready Pod should not be used for regular Service traffic unless its Service sets `publishNotReadyAddresses: true`. Inspect the EndpointSlice `conditions.ready` values and, if a probe is failing, the Pod's conditions and events:

```sh
kubectl get endpointslices \
  -l kubernetes.io/service-name=web \
  -o yaml
kubectl describe pod -l app=web
```

`kubectl rollout status` waits for the Deployment to complete its rollout; it does not prove that the endpoints are application-correct. Confirm that the health handlers return the intended responses, and exercise the Service with a real request as well.

To remove this example:

```sh
kubectl delete -f web.yaml
```

## Common mistakes

### Using liveness to check every dependency

If liveness fails whenever a database has a brief outage, kubelet restarts otherwise healthy application containers. During an outage, that can make recovery harder. Keep liveness focused on failures local to the process that a restart can plausibly fix. Use readiness to stop routing requests to an instance that cannot currently serve them.

### Reusing a startup check as liveness without understanding it

A startup check is allowed a larger startup window, then stops running after its first success. Liveness continues throughout the container's life. If both endpoints return success forever once startup completes, a deadlocked process can remain “live”; make the liveness handler test the specific local condition that indicates the process can still make progress.

### Making the probe too strict or too slow

Probe timeouts and thresholds are part of the failure budget. A one-second timeout can be too short under load; a very high failure threshold can delay detection. Measure the endpoint under realistic conditions and account for how many failures must occur before Kubernetes acts.

### Forgetting the application's own behavior

Kubernetes cannot infer correct health semantics from an HTTP 200 on `/`. The application must expose endpoints that match the checks. Keep them lightweight, avoid destructive side effects, and do not require credentials that the kubelet probe is not configured to send.

## References

- [Kubernetes: Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [Kubernetes: Configure Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes: EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
