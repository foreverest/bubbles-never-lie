import type {
  ContributorEntity,
  ContributorRepository,
  CommentEntity,
  PostEntity,
  PostRepository,
} from './types';

export type PostRelationOptions = {
  author?: true;
};

export type CommentRelationOptions = {
  posts?: true;
  author?: true;
};

export type HydratedPost<Options extends PostRelationOptions> = PostEntity &
  (Options extends { author: true } ? { author: ContributorEntity | null } : {});

export type HydratedComment<Options extends CommentRelationOptions> = CommentEntity &
  (Options extends { posts: true } ? { post: PostEntity | null } : {}) &
  (Options extends { author: true } ? { author: ContributorEntity | null } : {});

export type RelationHydrators = {
  hydratePostRelations<Options extends PostRelationOptions>(
    posts: PostEntity[],
    options: Options
  ): Promise<Array<HydratedPost<Options>>>;
  hydrateCommentRelations<Options extends CommentRelationOptions>(
    comments: CommentEntity[],
    options: Options
  ): Promise<Array<HydratedComment<Options>>>;
};

type RelationHydratorRepositories = {
  posts: PostRepository;
  contributors: ContributorRepository;
};

export const createRelationHydrators = ({
  posts: postRepository,
  contributors: contributorRepository,
}: RelationHydratorRepositories): RelationHydrators => ({
  async hydratePostRelations(posts, options) {
    const contributorsByName = options.author
      ? await loadEntitiesById(
          uniqueItems(posts.map((post) => post.authorName)),
          contributorRepository
        )
      : null;

    return posts.map((post) => {
      const hydrated: PostEntity & { author?: ContributorEntity | null } = { ...post };

      if (options.author) {
        hydrated.author = contributorsByName?.get(post.authorName) ?? null;
      }

      return hydrated as HydratedPost<typeof options>;
    });
  },

  async hydrateCommentRelations(comments, options) {
    const [postsById, contributorsByName] = await Promise.all([
      options.posts
        ? loadEntitiesById(
            uniqueItems(comments.map((comment) => comment.postId)),
            postRepository
          )
        : Promise.resolve(null),
      options.author
        ? loadEntitiesById(
            uniqueItems(comments.map((comment) => comment.authorName)),
            contributorRepository
          )
        : Promise.resolve(null),
    ]);

    return comments.map((comment) => {
      const hydrated: CommentEntity & {
        post?: PostEntity | null;
        author?: ContributorEntity | null;
      } = { ...comment };

      if (options.posts) {
        hydrated.post = postsById?.get(comment.postId) ?? null;
      }

      if (options.author) {
        hydrated.author = contributorsByName?.get(comment.authorName) ?? null;
      }

      return hydrated as HydratedComment<typeof options>;
    });
  },
});

const loadEntitiesById = async <Entity extends { id: string }>(
  ids: string[],
  repository: { getByIds(ids: string[]): Promise<Entity[]> }
): Promise<Map<string, Entity>> => {
  const entities = await repository.getByIds(ids);

  return new Map(entities.map((entity) => [entity.id, entity]));
};

const uniqueItems = (items: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  items.forEach((item) => {
    if (seen.has(item)) {
      return;
    }

    seen.add(item);
    unique.push(item);
  });

  return unique;
};
