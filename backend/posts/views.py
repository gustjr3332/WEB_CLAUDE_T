from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Post
from .serializers import PostSerializer


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer
    lookup_field = 'slug'

    @action(detail=True, methods=['post'])
    def like(self, request, slug=None):
        post = self.get_object()
        Post.objects.filter(pk=post.pk).update(like_count=F('like_count') + 1)
        post.refresh_from_db()
        return Response({'slug': post.slug, 'like_count': post.like_count})
