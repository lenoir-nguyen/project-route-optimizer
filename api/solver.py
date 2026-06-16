from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve_tsp(duration_matrix: list[list[int]], end_idx: int = 0) -> list[int]:
    """
    Solve TSP. Depot (start) is always index 0.
    end_idx=0 means round trip (end = start = depot).
    end_idx=N means open route ending at the last location in the matrix.

    Returns ordered node indices of the delivery stops (excludes start and end depots).
    """
    n = len(duration_matrix)
    manager = pywrapcp.RoutingIndexManager(n, 1, [0], [end_idx])
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
        return [i for i in range(1, n) if i != end_idx]

    route: list[int] = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != 0 and node != end_idx:
            route.append(node)
        index = solution.Value(routing.NextVar(index))
    return route
