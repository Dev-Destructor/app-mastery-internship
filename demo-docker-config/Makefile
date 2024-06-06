.RECIPEPREFIX = >
IMAGE_NAME = *******/*******
TAG = latest
DOCKERFILE_PATH = ./Dockerfile

.PHONY: build-push
build-push: build push

.PHONY: build
build:
>   docker build -t $(IMAGE_NAME):$(TAG) -f $(DOCKERFILE_PATH) .

.PHONY: push
push:
>   docker push $(IMAGE_NAME):$(TAG)

.PHONY: clean
clean:
>   docker rmi $(IMAGE_NAME):$(TAG)
