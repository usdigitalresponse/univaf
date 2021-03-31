#!/bin/sh

AWS_REGION=us-west-2
AWS_ACCOUNT_ID=681497372638
REPOSITORY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

IMAGE_NAME="appointment-seed-db"
IMAGE_TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $REPOSITORY

docker buildx build --platform linux/amd64 -t $IMAGE_NAME:$IMAGE_TAG -f ./server/Dockerfile.seed-db ./server

docker tag $IMAGE_NAME:$IMAGE_TAG $REPOSITORY/$IMAGE_NAME:$IMAGE_TAG
docker push $REPOSITORY/$IMAGE_NAME:$IMAGE_TAG