from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve_tsp(duration_matrix: list[list[int]]) -> list[int]:
    """
    Solve the Travelling Salesman Problem for a round trip starting and ending at depot (index 0).

    Args:
        duration_matrix: NxN integer matrix of travel durations in seconds.
                         Index 0 is always the depot.

    Returns:
        Ordered list of stop indices (excluding the depot at start/end).
        e.g. [2, 5, 1, 3, 4] means visit stop 2 first, then 5, etc.
    """
    n = len(duration_matrix)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)  # n nodes, 1 vehicle, depot=0
    routing = pywrapcp.RoutingModel(manager)

    def duration_callback(from_index: int, to_index: int) -> int:
        return duration_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_callback_index = routing.RegisterTransitCallback(duration_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.seconds = 10

    solution = routing.SolveWithParameters(search_params)
    if not solution:
        # Fallback: return original order if solver fails
        return list(range(1, n))

    route: list[int] = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != 0:  # skip depot
            route.append(node)
        index = solution.Value(routing.NextVar(index))
    return route
